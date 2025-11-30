// API routes for game save/load and authentication
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { registerCombatRoutes } from "./routes/combat";
import { registerDelveRoutes } from "./routes/delve";
import { registerLootRoutes } from "./routes/loot";
import { registerForgeRoutes } from "./routes/forge";
import { registerShopRoutes } from "./routes/shop";
import { registerRepairRoutes } from "./routes/repair";
import { registerZoneRoutes } from "./routes/zones";
import { registerEncounterRoutes } from "./routes/encounters";
import { 
  validateSavePayload, 
  recalculatePlayerStats, 
  calculateMaxHealth, 
  calculateMaxStamina,
  logSecurityEvent 
} from "./security";
import { 
  getSecurityStats, 
  getRecentSecurityEvents,
  logSecurityEvent as monitorLogEvent,
  validateAdminAccess,
  securityMiddleware
} from "./securityMonitor";

// Session tracking for multi-instance detection
interface SessionInfo {
  playerId: string;
  sessionId: string;
  lastHeartbeat: number;
}

const activeSessions = new Map<string, SessionInfo[]>();
const SESSION_TIMEOUT = 15000; // 15 seconds

// Helper to extract all item data from a save for minting prevention and value preservation
interface ItemValueRecord {
  enhancementLevel: number;
  durability: number;
  maxDurability: number;
  used: boolean; // Track if this slot has been matched
}

interface PreviousItemData {
  equipmentItemIds: Set<string>;
  inventoryItemIds: string[];
  footlockerItemIds: string[];
  // Map itemId -> array of all instances with their values (supports duplicates)
  itemValuesList: Map<string, ItemValueRecord[]>;
}

function extractAllItems(gameSave: any): PreviousItemData {
  const result: PreviousItemData = {
    equipmentItemIds: new Set<string>(),
    inventoryItemIds: [],
    footlockerItemIds: [],
    itemValuesList: new Map(),
  };

  if (!gameSave?.saveData?.player) {
    return result;
  }

  const player = gameSave.saveData.player;

  const recordItemValues = (item: any) => {
    if (item?.itemId) {
      const values: ItemValueRecord = {
        enhancementLevel: item.enhancementLevel ?? 0,
        durability: item.durability ?? 100,
        maxDurability: item.maxDurability ?? 100,
        used: false,
      };
      
      if (!result.itemValuesList.has(item.itemId)) {
        result.itemValuesList.set(item.itemId, []);
      }
      result.itemValuesList.get(item.itemId)!.push(values);
    }
  };

  if (player.equipment && typeof player.equipment === 'object') {
    for (const slot of Object.keys(player.equipment)) {
      const item = player.equipment[slot];
      if (item?.itemId) {
        result.equipmentItemIds.add(item.itemId);
        recordItemValues(item);
      }
    }
  }

  if (Array.isArray(player.inventory)) {
    for (const item of player.inventory) {
      if (item?.itemId) {
        result.inventoryItemIds.push(item.itemId);
        recordItemValues(item);
      }
    }
  }

  if (Array.isArray(player.footlocker)) {
    for (const item of player.footlocker) {
      if (item?.itemId) {
        result.footlockerItemIds.push(item.itemId);
        recordItemValues(item);
      }
    }
  }

  return result;
}

// Enforce server-authoritative item values (enhancement, durability)
// Uses sorted multiset matching to prevent value swapping between duplicates
function enforceItemValues(player: any, previousItems: PreviousItemData, playerId: string): void {
  
  // Collect all items from the new save, grouped by itemId
  const collectItems = (player: any): Map<string, Array<{ item: any; context: string }>> => {
    const itemsByType = new Map<string, Array<{ item: any; context: string }>>();
    
    if (player.equipment && typeof player.equipment === 'object') {
      for (const slot of Object.keys(player.equipment)) {
        const item = player.equipment[slot];
        if (item?.itemId) {
          if (!itemsByType.has(item.itemId)) itemsByType.set(item.itemId, []);
          itemsByType.get(item.itemId)!.push({ item, context: `equipment.${slot}` });
        }
      }
    }
    
    if (Array.isArray(player.inventory)) {
      for (let i = 0; i < player.inventory.length; i++) {
        const item = player.inventory[i];
        if (item?.itemId) {
          if (!itemsByType.has(item.itemId)) itemsByType.set(item.itemId, []);
          itemsByType.get(item.itemId)!.push({ item, context: `inventory[${i}]` });
        }
      }
    }
    
    if (Array.isArray(player.footlocker)) {
      for (let i = 0; i < player.footlocker.length; i++) {
        const item = player.footlocker[i];
        if (item?.itemId) {
          if (!itemsByType.has(item.itemId)) itemsByType.set(item.itemId, []);
          itemsByType.get(item.itemId)!.push({ item, context: `footlocker[${i}]` });
        }
      }
    }
    
    return itemsByType;
  };

  const clientItems = collectItems(player);
  
  // For each itemId, sort both client items and server slots by (enhancement DESC, durability DESC)
  // Then match positionally - this prevents value swapping
  for (const [itemId, clientList] of clientItems) {
    const serverSlots = previousItems.itemValuesList.get(itemId);
    if (!serverSlots || serverSlots.length === 0) continue; // New items, already validated
    
    // Sort client items by enhancement DESC, then durability DESC (best items first)
    const sortedClient = [...clientList].sort((a, b) => {
      const enhA = a.item.enhancementLevel ?? 0;
      const enhB = b.item.enhancementLevel ?? 0;
      if (enhB !== enhA) return enhB - enhA;
      const durA = a.item.durability ?? 100;
      const durB = b.item.durability ?? 100;
      return durB - durA;
    });
    
    // Sort server slots the same way (best slots first)
    const sortedServer = [...serverSlots].sort((a, b) => {
      if (b.enhancementLevel !== a.enhancementLevel) return b.enhancementLevel - a.enhancementLevel;
      return b.durability - a.durability;
    });
    
    // Match positionally - best client item must pair with best server slot
    for (let i = 0; i < sortedClient.length; i++) {
      const { item, context } = sortedClient[i];
      
      if (i >= sortedServer.length) {
        // More client items than server slots - this shouldn't happen if minting check passed
        console.error(`[SECURITY:CRITICAL] ${playerId}: ${context} - Extra item ${itemId} without matching server slot`);
        continue;
      }
      
      const serverSlot = sortedServer[i];
      const clientEnhancement = item.enhancementLevel ?? 0;
      const clientDurability = item.durability ?? 100;
      
      // Detect inflation attempts
      if (clientEnhancement > serverSlot.enhancementLevel || clientDurability > serverSlot.durability) {
        console.error(`[SECURITY:CRITICAL] ${playerId}: ${context} - Item value inflation blocked for ${itemId} (client: enh=${clientEnhancement} dur=${clientDurability}, server: enh=${serverSlot.enhancementLevel} dur=${serverSlot.durability})`);
      }
      
      // Enforce server values - items can only match or decrease
      item.enhancementLevel = serverSlot.enhancementLevel;
      item.durability = Math.min(clientDurability, serverSlot.durability);
      item.maxDurability = serverSlot.maxDurability;
    }
  }
}

// Clean up stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [playerId, sessions] of activeSessions.entries()) {
    const activeSessions_filtered = sessions.filter(s => now - s.lastHeartbeat < SESSION_TIMEOUT);
    if (activeSessions_filtered.length === 0) {
      activeSessions.delete(playerId);
    } else {
      activeSessions.set(playerId, activeSessions_filtered);
    }
  }
}, 5000);

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);
  
  // Security monitoring middleware - runs AFTER auth so req.user is available
  app.use('/api/', securityMiddleware);

  // Register combat routes (server-authoritative combat system)
  registerCombatRoutes(app);

  // Register delve generation routes (server-authoritative delve system)
  registerDelveRoutes(app);

  // Register loot rolling routes (server-authoritative loot system)
  registerLootRoutes(app);

  // Register forge routes (server-authoritative item enhancement)
  registerForgeRoutes(app);

  // Register shop routes (server-authoritative shop purchases)
  registerShopRoutes(app);

  // Register repair routes (server-authoritative item repairs)
  registerRepairRoutes(app);

  // Register zone routes (mage tower warping and rift discovery)
  registerZoneRoutes(app);

  // Register encounter routes (wilderness encounters like trapped chests)
  registerEncounterRoutes(app);

  // Logout endpoint
  app.post('/api/auth/logout', async (req, res) => {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            return res.status(500).json({ message: "Logout failed" });
          }
          res.json({ success: true });
        });
      } else {
        res.json({ success: true });
      }
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Get current authenticated user (Replit Auth only)
  app.get('/api/auth/me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Load game save (Replit Auth only)
  app.get("/api/game/load", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const gameSave = await storage.getGameSaveByUserId(userId);
      
      if (!gameSave) {
        return res.status(404).json({ message: "No save found" });
      }
      
      const saveData = gameSave.saveData as any;
      
      // Ensure server-authoritative state exists
      let serverState = await storage.getPlayerCurrency(userId);
      if (!serverState) {
        serverState = await storage.ensurePlayerCurrency(userId, 0, 0);
      }
      
      // SECURITY: Inject ALL server-authoritative values
      // These values can NEVER be set by the client
      saveData.player.arcaneAsh = serverState.arcaneAsh;
      saveData.player.crystallineAnimus = serverState.crystallineAnimus;
      saveData.player.level = serverState.level;
      saveData.player.experience = serverState.experience;
      
      // Calculate max HP/SP based on server-authoritative level
      saveData.player.maxHealth = calculateMaxHealth(serverState.level);
      saveData.player.maxStamina = calculateMaxStamina(serverState.level);
      
      // Clamp current HP/SP to max values (prevent exploits)
      if (saveData.player.health > saveData.player.maxHealth) {
        saveData.player.health = saveData.player.maxHealth;
      }
      if (saveData.player.stamina > saveData.player.maxStamina) {
        saveData.player.stamina = saveData.player.maxStamina;
      }
      
      // SECURITY: Recalculate stats from equipment - NEVER trust client stats
      // Always recalculate even with empty equipment to ensure baseline stats
      saveData.player.stats = recalculatePlayerStats(saveData.player.equipment || {}, serverState.level);
      
      res.json({
        saveData,
        lastSaved: gameSave.lastSaved
      });
    } catch (error) {
      console.error("Error loading game:", error);
      res.status(500).json({ message: "Failed to load game" });
    }
  });

  // Save game state (Replit Auth only)
  app.post("/api/game/save", isAuthenticated, async (req: any, res) => {
    try {
      const { saveData } = req.body;
      const userId = req.user.claims.sub;
      
      if (!saveData) {
        return res.status(400).json({ message: "Save data required" });
      }
      
      // SECURITY: Load previous save state for item reconciliation
      const previousSave = await storage.getGameSaveByUserId(userId);
      const previousItems = extractAllItems(previousSave);
      
      // SECURITY: Get hasReceivedStarterKit from server-authoritative previous save
      // This prevents clients from spoofing the flag to bypass item minting detection
      // EXCEPTION: For brand new players (no previous save), we trust the client's first
      // save to set hasReceivedStarterKit=true since there's nothing to spoof yet.
      // The item minting validation will still enforce quantity limits.
      const prevSaveData = previousSave?.saveData as any;
      const isFirstSaveEver = previousSave === null || previousSave === undefined;
      const serverAuthoritativeHasReceivedStarterKit = isFirstSaveEver
        ? (saveData?.player?.hasReceivedStarterKit === true)
        : (prevSaveData?.player?.hasReceivedStarterKit === true);
      
      // SECURITY: Validate and sanitize save payload with canonical item reconstruction
      const validation = validateSavePayload(
        saveData, 
        userId, 
        previousItems, 
        serverAuthoritativeHasReceivedStarterKit
      );
      if (!validation.valid) {
        return res.status(400).json({ 
          message: "Invalid save data",
          errors: validation.errors
        });
      }
      
      // Use sanitized data with forbidden fields stripped
      const sanitizedData = validation.sanitizedData;
      
      // SECURITY: Enforce server-authoritative item values (enhancement, durability)
      // This prevents clients from inflating enhancement levels or repairing items via save
      enforceItemValues(sanitizedData.player, previousItems, userId);
      
      // Ensure server-authoritative state exists
      let serverState = await storage.getPlayerCurrency(userId);
      if (!serverState) {
        serverState = await storage.ensurePlayerCurrency(userId, 0, 0);
      }
      
      // SECURITY: Re-inject server-authoritative values before saving
      // This ensures even if validation missed something, server values prevail
      sanitizedData.player.level = serverState.level;
      sanitizedData.player.experience = serverState.experience;
      sanitizedData.player.arcaneAsh = serverState.arcaneAsh;
      sanitizedData.player.crystallineAnimus = serverState.crystallineAnimus;
      sanitizedData.player.maxHealth = calculateMaxHealth(serverState.level);
      sanitizedData.player.maxStamina = calculateMaxStamina(serverState.level);
      
      // Clamp current HP/SP
      if (sanitizedData.player.health > sanitizedData.player.maxHealth) {
        sanitizedData.player.health = sanitizedData.player.maxHealth;
      }
      if (sanitizedData.player.stamina > sanitizedData.player.maxStamina) {
        sanitizedData.player.stamina = sanitizedData.player.maxStamina;
      }
      
      // Recalculate stats from equipment (always, even if empty)
      sanitizedData.player.stats = recalculatePlayerStats(sanitizedData.player.equipment || {}, serverState.level);
      
      const result = await storage.saveGame({
        userId,
        saveData: sanitizedData,
      });
      
      res.json({
        success: true,
        lastSaved: result.lastSaved
      });
    } catch (error) {
      console.error("Error saving game:", error);
      res.status(500).json({ message: "Failed to save game" });
    }
  });

  // Helper to get playerId from request (Replit Auth only)
  const getPlayerId = (req: any): string | null => {
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
      return req.user.claims.sub;
    }
    return null;
  };

  // Heartbeat endpoint for multi-instance detection (Replit Auth only)
  // Security: playerId comes from authenticated session, not client request
  app.post("/api/game/heartbeat", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const instanceId = req.body.instanceId; // Unique per tab/window
      
      // Validate playerId is a non-empty string (should always be true via isAuthenticated)
      if (!playerId || typeof playerId !== 'string') {
        console.error('[SECURITY] Heartbeat received without valid playerId');
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!instanceId || typeof instanceId !== 'string') {
        return res.status(400).json({ message: "Instance ID required" });
      }

      const now = Date.now();
      
      // Get or create session list for this player
      let sessions = activeSessions.get(playerId) || [];
      
      // Find existing session or add new one
      const existingSession = sessions.find(s => s.sessionId === instanceId);
      if (existingSession) {
        existingSession.lastHeartbeat = now;
      } else {
        sessions.push({ playerId, sessionId: instanceId, lastHeartbeat: now });
      }
      
      // Filter out stale sessions
      sessions = sessions.filter(s => now - s.lastHeartbeat < SESSION_TIMEOUT);
      activeSessions.set(playerId, sessions);
      
      // Check for duplicates (more than one active session)
      const hasDuplicate = sessions.length > 1;
      
      res.json({ 
        success: true, 
        hasDuplicate,
        activeSessionCount: sessions.length 
      });
    } catch (error) {
      console.error("Error processing heartbeat:", error);
      res.status(500).json({ message: "Failed to process heartbeat" });
    }
  });

  // Soulbinding endpoints (Replit Auth only)
  app.get("/api/soulbound/slots", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const slots = await storage.getSoulboundSlots(playerId);
      res.json({ slots: slots.map(s => s.slotName) });
    } catch (error) {
      console.error("Error fetching soulbound slots:", error);
      res.status(500).json({ message: "Failed to fetch soulbound slots" });
    }
  });

  app.post("/api/soulbound/slots", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const { slots } = req.body;
      
      if (!Array.isArray(slots)) {
        return res.status(400).json({ message: "Slots must be an array" });
      }

      // Validate slots (max 3, valid slot names matching PlayerEquipment interface)
      const validSlots = ['mainHand', 'offHand', 'helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape'];
      if (slots.length > 3 || !slots.every(slot => validSlots.includes(slot))) {
        return res.status(400).json({ message: "Invalid slot configuration" });
      }

      // Get current soulbound slots to calculate cost
      const currentSlots = await storage.getSoulboundSlots(playerId);
      const currentSlotNames = new Set(currentSlots.map(s => s.slotName));
      
      // Find newly bound items (items being added that aren't already bound)
      const newlyBoundItems = slots.filter(slot => !currentSlotNames.has(slot));
      const cost = newlyBoundItems.length; // 1 CA per newly bound item
      
      // Atomically deduct CA if there's a cost (server-authoritative, cannot be bypassed)
      if (cost > 0) {
        const updated = await storage.deductCrystallineAnimus(playerId, cost);
        if (!updated) {
          // Deduction failed - insufficient balance
          const currency = await storage.getPlayerCurrency(playerId);
          const currentCA = currency?.crystallineAnimus || 0;
          return res.status(400).json({ 
            message: `Not enough Crystalline Animus! Need ${cost} CA to bind ${newlyBoundItems.length} item(s). You have ${currentCA} CA.`,
            cost,
            currentCA
          });
        }
        
        // Success - update slots and return new balance
        await storage.setSoulboundSlots(playerId, slots);
        res.json({ 
          success: true, 
          cost,
          newCA: updated.crystallineAnimus
        });
      } else {
        // No cost - just update slots
        await storage.setSoulboundSlots(playerId, slots);
        const currency = await storage.getPlayerCurrency(playerId);
        res.json({ 
          success: true, 
          cost: 0,
          newCA: currency?.crystallineAnimus || 0
        });
      }
    } catch (error) {
      console.error("Error setting soulbound slots:", error);
      res.status(500).json({ message: "Failed to set soulbound slots" });
    }
  });

  // Tombstone endpoints (Replit Auth only)
  app.post("/api/tombstones/create", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const { ownerName, worldX, worldY, items, expiresInHours } = req.body;
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (expiresInHours || 24));

      const tombstone = await storage.createTombstone({
        ownerId: playerId,
        ownerName,
        worldX,
        worldY,
        items,
        expiresAt,
      });

      res.json({ tombstone });
    } catch (error) {
      console.error("Error creating tombstone:", error);
      res.status(500).json({ message: "Failed to create tombstone" });
    }
  });

  app.get("/api/tombstones/mine", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const tombstones = await storage.getPlayerTombstones(playerId);
      res.json({ tombstones });
    } catch (error) {
      console.error("Error fetching player tombstones:", error);
      res.status(500).json({ message: "Failed to fetch tombstones" });
    }
  });

  app.get("/api/tombstones/random", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const tombstone = await storage.getRandomTombstone(playerId);
      res.json({ tombstone: tombstone || null });
    } catch (error) {
      console.error("Error fetching random tombstone:", error);
      res.status(500).json({ message: "Failed to fetch random tombstone" });
    }
  });

  app.post("/api/tombstones/:id/loot", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify tombstone exists and is lootable
      const tombstone = await storage.getTombstoneById(id);
      
      if (!tombstone) {
        return res.status(404).json({ message: "Tombstone not found" });
      }
      
      if (tombstone.looted) {
        return res.status(400).json({ message: "Tombstone already looted" });
      }
      
      if (new Date(tombstone.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Tombstone has expired" });
      }
      
      if (tombstone.ownerId === playerId) {
        return res.status(400).json({ message: "Cannot loot your own tombstone through this endpoint" });
      }

      await storage.markTombstoneLooted(id, playerId);
      res.json({ success: true, items: tombstone.items });
    } catch (error) {
      console.error("Error marking tombstone looted:", error);
      res.status(500).json({ message: "Failed to mark tombstone looted" });
    }
  });

  app.delete("/api/tombstones/:id", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify the tombstone exists and belongs to this player
      const tombstone = await storage.getTombstoneById(id);
      
      if (!tombstone) {
        return res.status(404).json({ message: "Tombstone not found" });
      }
      
      if (tombstone.ownerId !== playerId) {
        return res.status(403).json({ message: "You are not authorized to delete this tombstone" });
      }

      await storage.deleteTombstone(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tombstone:", error);
      res.status(500).json({ message: "Failed to delete tombstone" });
    }
  });

  // Karma/return endpoints (Replit Auth only)
  app.get("/api/karma/looted-tombstones", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const tombstones = await storage.getLootedTombstones(playerId);
      res.json({ tombstones });
    } catch (error) {
      console.error("Error getting looted tombstones:", error);
      res.status(500).json({ message: "Failed to get looted tombstones" });
    }
  });

  app.post("/api/karma/return", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const { originalOwnerId, returnerName, items } = req.body;

      const returnedLoot = await storage.createReturnedLoot({
        originalOwnerId,
        returnedById: playerId,
        returnerName,
        items,
      });

      await storage.addKarmaEvent({
        playerId,
        playerName: returnerName,
        itemCount: items.length,
      });

      res.json({ success: true, returnedLoot });
    } catch (error) {
      console.error("Error returning loot:", error);
      res.status(500).json({ message: "Failed to return loot" });
    }
  });

  app.get("/api/karma/pending", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const pending = await storage.getPendingReturns(playerId);
      res.json({ pending });
    } catch (error) {
      console.error("Error fetching pending returns:", error);
      res.status(500).json({ message: "Failed to fetch pending returns" });
    }
  });

  app.post("/api/karma/claim/:id", isAuthenticated, async (req: any, res) => {
    try {
      const playerId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify the pending return belongs to this player
      const pending = await storage.getPendingReturns(playerId);
      const lootItem = pending.find(item => item.id === id);
      
      if (!lootItem) {
        return res.status(403).json({ message: "You are not authorized to claim this loot" });
      }

      const claimed = await storage.claimReturnedLoot(id);
      res.json({ claimed });
    } catch (error) {
      console.error("Error claiming returned loot:", error);
      res.status(500).json({ message: "Failed to claim loot" });
    }
  });

  app.get("/api/karma/leaderboard", async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const leaderboard = await storage.getKarmaLeaderboard(limit);
      res.json({ leaderboard });
    } catch (error) {
      console.error("Error fetching karma leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Security monitoring endpoints (admin only - requires ADMIN_KEY header)
  // These endpoints require a properly configured ADMIN_KEY (32+ chars)
  app.get("/api/admin/security/stats", (req: any, res) => {
    const validation = validateAdminAccess(req);
    if (!validation.valid) {
      return res.status(403).json({ message: validation.reason || "Unauthorized" });
    }
    
    const stats = getSecurityStats();
    res.json(stats);
  });

  app.get("/api/admin/security/events", (req: any, res) => {
    const validation = validateAdminAccess(req);
    if (!validation.valid) {
      return res.status(403).json({ message: validation.reason || "Unauthorized" });
    }
    
    const count = Math.min(parseInt(req.query.count as string) || 100, 500); // Cap at 500
    const severity = req.query.severity as string;
    const playerId = req.query.playerId as string;
    
    const events = getRecentSecurityEvents(count, severity as any, playerId);
    res.json({ events });
  });

  // Privacy Policy endpoint
  app.get("/api/privacy-policy", (req, res) => {
    res.json({
      title: "Gemforge Chronicles Privacy Policy",
      lastUpdated: "2024-01-01",
      sections: [
        {
          heading: "Data We Collect",
          content: "We collect only the minimum data necessary to provide the game service: your Replit user ID (for authentication), game progress, and in-game currency balances. We do not collect personal information such as email addresses, real names, or payment information."
        },
        {
          heading: "How We Use Your Data",
          content: "Your data is used solely to save and restore your game progress, authenticate your identity, and prevent cheating. We do not sell, share, or use your data for advertising purposes."
        },
        {
          heading: "Data Storage and Security",
          content: "Your game data is stored securely in our PostgreSQL database hosted on Replit's infrastructure. All communications are encrypted using HTTPS/TLS. We implement server-authoritative validation to protect game integrity."
        },
        {
          heading: "Data Retention",
          content: "We retain your game data as long as your account is active. If you wish to delete your data, please contact us through Replit."
        },
        {
          heading: "Your Rights",
          content: "You have the right to: access your personal data, request correction of inaccurate data, request deletion of your data, and withdraw consent at any time."
        },
        {
          heading: "Third-Party Services",
          content: "We use Replit for authentication and hosting. Replit's privacy policy applies to the authentication process. We do not integrate any other third-party tracking or analytics services."
        },
        {
          heading: "Contact",
          content: "For privacy-related inquiries, please contact us through Replit's messaging system."
        }
      ]
    });
  });

  // Terms of Service endpoint
  app.get("/api/terms-of-service", (req, res) => {
    res.json({
      title: "Gemforge Chronicles Terms of Service",
      lastUpdated: "2024-01-01",
      sections: [
        {
          heading: "Acceptance of Terms",
          content: "By playing Gemforge Chronicles, you agree to these Terms of Service. If you do not agree, please do not use the game."
        },
        {
          heading: "Account Security",
          content: "You are responsible for maintaining the security of your Replit account. Do not share your login credentials with others. Report any unauthorized access immediately."
        },
        {
          heading: "Fair Play",
          content: "You agree to play fairly and not use cheats, exploits, or third-party tools to gain unfair advantages. Violations may result in account suspension or permanent ban."
        },
        {
          heading: "In-Game Economy",
          content: "In-game currencies (Arcane Ash, Crystalline Animus) have no real-world value. Trading or selling in-game items for real money is prohibited."
        },
        {
          heading: "Intellectual Property",
          content: "All game content, including but not limited to graphics, code, game mechanics, and story elements, is the intellectual property of the game developers. Unauthorized copying, modification, or distribution is prohibited."
        },
        {
          heading: "Service Availability",
          content: "We strive to provide uninterrupted service but do not guarantee 100% uptime. We may modify, suspend, or discontinue the game at any time without notice."
        },
        {
          heading: "Limitation of Liability",
          content: "The game is provided 'as is' without warranties. We are not liable for any damages arising from your use of the game, including loss of data or progress."
        },
        {
          heading: "Changes to Terms",
          content: "We may update these terms at any time. Continued use of the game after changes constitutes acceptance of the new terms."
        }
      ]
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
