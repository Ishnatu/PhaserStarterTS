// Combat API routes - server-authoritative combat system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { CombatSystem } from "../systems/CombatSystem";
import { DiceRoller } from "../systems/DiceRoller";
import { EnemyFactory } from "../systems/EnemyFactory";
import { WeaponValidator } from "../systems/WeaponValidator";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
import { validateSavePayload, enforceServerAuthoritativeValues, recalculatePlayerStats, logSecurityEvent, calculateMaxHealth, calculateMaxStamina } from "../security";
import { trackCurrencyGain } from "../securityMonitor";
import type { CombatState, Enemy, PlayerData, WeaponAttack } from "../../shared/types";

/**
 * Combat session with RNG state for deterministic replay
 */
interface CombatSession {
  userId: string; // Owner of this combat session (prevents hijacking)
  combatState: CombatState;
  rngSeed: number;
  rngCalls: number;
  // Security: Track server-generated enemy data for loot validation
  enemyTier: number;
  hasBoss: boolean;
  enemyNames: string[];
}

/**
 * Pending loot entitlements - only created when combat is WON server-side
 * This prevents attackers from calling loot/roll without winning combat
 */
interface PendingLootEntitlement {
  userId: string;
  sessionId: string;
  enemyName: string;
  tier: number;
  isBoss: boolean;
  createdAt: number;
  consumed: boolean;
}

// Store pending loot entitlements that can only be created by winning combat
const pendingLootEntitlements = new Map<string, PendingLootEntitlement>();

// Cleanup old entitlements (5 minute expiry)
const LOOT_ENTITLEMENT_EXPIRY_MS = 5 * 60 * 1000;

function cleanupExpiredEntitlements() {
  const now = Date.now();
  for (const [key, entitlement] of pendingLootEntitlements) {
    if (now - entitlement.createdAt > LOOT_ENTITLEMENT_EXPIRY_MS || entitlement.consumed) {
      pendingLootEntitlements.delete(key);
    }
  }
}

// Export for loot route to access
export function consumeLootEntitlement(userId: string, sessionId: string): PendingLootEntitlement | null {
  cleanupExpiredEntitlements();
  
  const key = `${userId}_${sessionId}`;
  const entitlement = pendingLootEntitlements.get(key);
  
  if (!entitlement) {
    return null;
  }
  
  if (entitlement.userId !== userId) {
    return null;
  }
  
  if (entitlement.consumed) {
    return null;
  }
  
  // Mark as consumed to prevent replay
  entitlement.consumed = true;
  pendingLootEntitlements.set(key, entitlement);
  
  return entitlement;
}

// Create loot entitlement when combat is won
function createLootEntitlement(session: CombatSession, sessionId: string): void {
  // Create entitlement for the first enemy (main reward)
  // In multi-enemy combat, rewards are combined
  const key = `${session.userId}_${sessionId}`;
  
  pendingLootEntitlements.set(key, {
    userId: session.userId,
    sessionId,
    enemyName: session.enemyNames[0] || 'Unknown',
    tier: session.enemyTier,
    isBoss: session.hasBoss,
    createdAt: Date.now(),
    consumed: false,
  });
  
  console.log(`[SECURITY] Created loot entitlement for ${session.userId}: tier=${session.enemyTier}, boss=${session.hasBoss}`);
}

/**
 * [SECURITY] Wilderness encounter sessions
 * Created before wilderness combat, validated during loot claims
 * Prevents attackers from claiming loot without registering an encounter
 */
interface WildernessEncounterSession {
  userId: string;
  tier: number;
  enemyCount: number;
  hasBoss: boolean;
  createdAt: number;
  lootClaimed: number; // Track how many loot claims have been made
}

const wildernessEncounterSessions = new Map<string, WildernessEncounterSession>();
const WILDERNESS_SESSION_EXPIRY_MS = 10 * 60 * 1000; // 10 minute expiry

function cleanupExpiredWildernessSessions() {
  const now = Date.now();
  for (const [key, session] of wildernessEncounterSessions) {
    if (now - session.createdAt > WILDERNESS_SESSION_EXPIRY_MS) {
      wildernessEncounterSessions.delete(key);
    }
  }
}

/**
 * Validate and consume a wilderness encounter session for loot claims
 * Returns the session info if valid, null if invalid/exhausted
 */
export function consumeWildernessEncounterLoot(userId: string, sessionId: string): { tier: number; isBoss: boolean } | null {
  cleanupExpiredWildernessSessions();
  
  const session = wildernessEncounterSessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  if (session.userId !== userId) {
    return null;
  }
  
  // Check if all enemies have been looted
  if (session.lootClaimed >= session.enemyCount) {
    return null;
  }
  
  // Increment loot claim counter
  session.lootClaimed++;
  wildernessEncounterSessions.set(sessionId, session);
  
  return { tier: session.tier, isBoss: session.hasBoss && session.lootClaimed === session.enemyCount };
}

/**
 * Create a wilderness encounter session (called before combat starts)
 */
export function createWildernessEncounterSession(
  userId: string, 
  tier: number, 
  enemyCount: number, 
  hasBoss: boolean
): string {
  cleanupExpiredWildernessSessions();
  
  const sessionId = `wild_${userId}_${Date.now()}`;
  
  wildernessEncounterSessions.set(sessionId, {
    userId,
    tier,
    enemyCount,
    hasBoss,
    createdAt: Date.now(),
    lootClaimed: 0,
  });
  
  console.log(`[SECURITY] Created wilderness encounter session ${sessionId}: tier=${tier}, enemies=${enemyCount}, boss=${hasBoss}`);
  
  return sessionId;
}

/**
 * [SECURITY] Treasure encounter session tracking
 * Prevents spamming /api/combat/wilderness-reward without valid encounter
 */
interface TreasureSession {
  sessionId: string;
  userId: string;
  tier: number;
  type: 'treasure' | 'shrine';
  expiresAt: number;
  claimed: boolean;
}

const activeTreasureSessions = new Map<string, TreasureSession>();

export function createTreasureSession(userId: string, tier: number, type: 'treasure' | 'shrine'): string {
  const sessionId = `treasure_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 min expiry
  
  activeTreasureSessions.set(sessionId, {
    sessionId,
    userId,
    tier,
    type,
    expiresAt,
    claimed: false,
  });
  
  console.log(`[SECURITY] Created treasure session ${sessionId}: tier=${tier}, type=${type}`);
  
  return sessionId;
}

export function consumeTreasureSession(sessionId: string, userId: string): TreasureSession | null {
  const session = activeTreasureSessions.get(sessionId);
  
  if (!session) {
    console.log(`[SECURITY] Treasure session not found: ${sessionId}`);
    return null;
  }
  
  if (session.userId !== userId) {
    logSecurityEvent(userId, 'TREASURE_SESSION_USER_MISMATCH', 'CRITICAL', {
      message: `Treasure session ${sessionId} belongs to different user`,
      expectedUser: session.userId,
      claimingUser: userId,
    });
    return null;
  }
  
  if (session.expiresAt < Date.now()) {
    activeTreasureSessions.delete(sessionId);
    console.log(`[SECURITY] Treasure session expired: ${sessionId}`);
    return null;
  }
  
  if (session.claimed) {
    logSecurityEvent(userId, 'TREASURE_SESSION_ALREADY_CLAIMED', 'HIGH', {
      message: `Treasure session ${sessionId} already claimed`,
      sessionId,
    });
    return null;
  }
  
  // Mark as claimed and delete
  session.claimed = true;
  activeTreasureSessions.delete(sessionId);
  
  console.log(`[SECURITY] Consumed treasure session ${sessionId}`);
  return session;
}

/**
 * Session-based combat state storage
 * In production, this should be Redis/database-backed
 */
const activeCombatSessions = new Map<string, CombatSession>();

/**
 * Persist player state when combat is abandoned (fled or disconnected)
 * This prevents stamina/HP exploitation by bailing on combat
 * 
 * Resources that persist on abandonment:
 * - health: Damage taken during combat
 * - stamina: Stamina spent on attacks
 * - inventory: Items consumed during combat
 * - statusConditions: Any conditions applied during combat
 * 
 * Resources NOT given on abandonment:
 * - No loot/rewards (didn't win)
 * - No XP (didn't complete combat)
 */
async function finalizeAbandonedCombat(session: CombatSession): Promise<boolean> {
  try {
    const userId = session.userId;
    const combatPlayer = session.combatState.player;
    
    // Load FULL current save to preserve all data (delve state, map progress, etc)
    const gameSave = await storage.getGameSaveByUserId(userId);
    if (!gameSave || !gameSave.saveData) {
      console.error(`[COMBAT ABANDON] Failed to load save for ${userId}`);
      return false;
    }
    
    // Work with the full save data structure
    // Handle case where saveData might be a JSON string or object
    const fullSaveData = typeof gameSave.saveData === 'string' 
      ? JSON.parse(gameSave.saveData as string) 
      : gameSave.saveData as any;
    const savedPlayer = fullSaveData.player || fullSaveData as PlayerData;
    
    // Merge ONLY combat-relevant fields into the existing player data
    // This preserves all other save data (delve, map, currencies, etc)
    const updatedPlayer: PlayerData = {
      ...savedPlayer,
      health: combatPlayer.health,
      stamina: combatPlayer.stamina,
      inventory: combatPlayer.inventory,
      statusConditions: combatPlayer.statusConditions,
    };
    
    // Reconstruct the full save with updated player data
    // Preserve any other top-level fields (delve state, explored tiles, etc)
    const updatedSaveData = fullSaveData.player 
      ? { ...fullSaveData, player: updatedPlayer }
      : updatedPlayer;
    
    // Validate and sanitize the complete save payload
    const validated = validateSavePayload(
      fullSaveData.player ? updatedSaveData : { player: updatedPlayer }, 
      userId
    );
    
    if (!validated.valid || !validated.sanitizedData) {
      console.error(`[COMBAT ABANDON] Validation failed for ${userId}:`, validated.errors);
      return false;
    }
    
    // Enforce server-authoritative values (level, stats, etc)
    const enforced = await enforceServerAuthoritativeValues(userId, validated.sanitizedData);
    
    // Save the complete updated save data (preserving all non-combat fields)
    await storage.saveGame({
      userId,
      saveData: enforced,
    });
    
    console.log(`[COMBAT ABANDON] Saved abandoned combat state for ${userId} - HP: ${combatPlayer.health}, SP: ${combatPlayer.stamina}`);
    return true;
  } catch (error) {
    console.error('[COMBAT ABANDON] Error finalizing abandoned combat:', error);
    return false;
  }
}

export function registerCombatRoutes(app: Express) {
  /**
   * POST /api/combat/wilderness-encounter
   * [SECURITY] Registers a wilderness encounter before combat starts
   * Client must call this before entering combat in the wilderness
   * Returns a sessionId that must be used when claiming loot
   */
  app.post("/api/combat/wilderness-encounter", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tier, enemyCount, hasBoss } = req.body;

      // [SECURITY] Validate input
      if (typeof tier !== 'number' || tier < 1 || tier > 5) {
        return res.status(400).json({ message: "Invalid tier: must be 1-5" });
      }

      if (typeof enemyCount !== 'number' || enemyCount < 1 || enemyCount > 5) {
        return res.status(400).json({ message: "Invalid enemy count: must be 1-5" });
      }

      // [SECURITY] Validate tier against player's accessible zones
      const progress = await storage.getDelveProgress(userId);
      let maxAccessibleTier = 1;
      
      // Zone unlock requirements
      const requirements: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 20, 5: 50 };
      
      // Map tier numbers to property names
      const tierKeys: Record<number, 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5'> = {
        1: 'tier1', 2: 'tier2', 3: 'tier3', 4: 'tier4', 5: 'tier5'
      };
      
      for (let t = 2; t <= 5; t++) {
        const required = requirements[t];
        const prevTierKey = tierKeys[t - 1];
        const completed = progress?.[prevTierKey] || 0;
        if (completed >= required) {
          maxAccessibleTier = t;
        } else {
          break;
        }
      }

      // Clamp tier to player's accessible zones
      const validatedTier = Math.min(tier, maxAccessibleTier);
      
      if (tier > maxAccessibleTier) {
        logSecurityEvent(userId, 'WILD_ENCOUNTER_TIER_EXCEEDS_ACCESS', 'MEDIUM', {
          message: `Wilderness encounter tier ${tier} exceeds max accessible ${maxAccessibleTier}`,
          ip: req.ip,
          claimedTier: tier,
          maxAccessibleTier,
        });
      }

      // Create wilderness encounter session
      const sessionId = createWildernessEncounterSession(
        userId,
        validatedTier,
        enemyCount,
        hasBoss || false
      );

      res.json({
        success: true,
        sessionId,
        validatedTier, // Let client know if tier was clamped
      });
    } catch (error) {
      console.error("Error creating wilderness encounter:", error);
      res.status(500).json({ message: "Failed to create encounter session" });
    }
  });

  /**
   * POST /api/combat/treasure-session
   * [SECURITY] Creates a treasure encounter session before claiming rewards
   * Client must call this when a treasure/shrine encounter is triggered
   */
  app.post("/api/combat/treasure-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type, tier } = req.body;

      // [SECURITY] Validate encounter type
      const validTypes = ['treasure', 'shrine'];
      if (!validTypes.includes(type)) {
        logSecurityEvent(userId, 'TREASURE_SESSION_INVALID_TYPE', 'HIGH', {
          message: `Invalid treasure session type: ${type}`,
          ip: req.ip,
          type,
        });
        return res.status(400).json({ message: "Invalid encounter type" });
      }

      // [SECURITY] Validate tier against player's accessible zones
      const progress = await storage.getDelveProgress(userId);
      let maxAccessibleTier = 1;
      
      const requirements: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 20, 5: 50 };
      
      // Map tier numbers to property names
      const tierKeys: Record<number, 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5'> = {
        1: 'tier1', 2: 'tier2', 3: 'tier3', 4: 'tier4', 5: 'tier5'
      };
      
      for (let t = 2; t <= 5; t++) {
        const required = requirements[t];
        const prevTierKey = tierKeys[t - 1];
        const completed = progress?.[prevTierKey] || 0;
        if (completed >= required) {
          maxAccessibleTier = t;
        } else {
          break;
        }
      }

      // Clamp tier to player's accessible zones
      const validatedTier = Math.min(tier || 1, maxAccessibleTier);
      
      if (tier > maxAccessibleTier) {
        logSecurityEvent(userId, 'TREASURE_SESSION_TIER_EXCEEDS_ACCESS', 'MEDIUM', {
          message: `Treasure session tier ${tier} exceeds max accessible ${maxAccessibleTier}`,
          ip: req.ip,
          claimedTier: tier,
          maxAccessibleTier,
        });
      }

      // Create treasure session
      const sessionId = createTreasureSession(userId, validatedTier, type);

      res.json({
        success: true,
        sessionId,
        validatedTier,
      });
    } catch (error) {
      console.error("Error creating treasure session:", error);
      res.status(500).json({ message: "Failed to create treasure session" });
    }
  });

  /**
   * POST /api/combat/wilderness-reward
   * [SECURITY] Grants non-combat wilderness rewards (treasure, shrine)
   * REQUIRES valid sessionId from /api/combat/treasure-session
   * Session can only be claimed once
   */
  app.post("/api/combat/wilderness-reward", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.body;

      // [SECURITY] Require valid session - NO FALLBACK
      if (!sessionId) {
        logSecurityEvent(userId, 'TREASURE_REWARD_NO_SESSION', 'CRITICAL', {
          message: 'Treasure reward claim without session',
          ip: req.ip,
        });
        return res.status(403).json({ message: "Valid session required for treasure claims" });
      }

      // [SECURITY] Validate and consume session (single use)
      const session = consumeTreasureSession(sessionId, userId);
      if (!session) {
        logSecurityEvent(userId, 'TREASURE_REWARD_INVALID_SESSION', 'HIGH', {
          message: `Invalid or expired treasure session: ${sessionId}`,
          ip: req.ip,
          sessionId,
        });
        return res.status(403).json({ message: "Invalid or expired session" });
      }

      // Use tier from validated session, not client
      const validatedTier = session.tier;
      const type = session.type;

      // [SERVER-AUTHORITATIVE] Generate rewards with deterministic RNG
      // Seed from session ID for auditability
      const sessionSeed = sessionId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const rng = new SeededRNG(sessionSeed);
      
      // Treasure: 40-80 AA, 3-6 CA (scaled by tier)
      // Shrine: No immediate reward - handled separately
      let arcaneAsh = 0;
      let crystallineAnimus = 0;

      if (type === 'treasure') {
        const baseAA = rng.nextInt(40, 80, 'treasure_aa');
        const baseCA = rng.nextInt(3, 6, 'treasure_ca');
        
        // Scale by tier
        arcaneAsh = Math.floor(baseAA * (1 + (validatedTier - 1) * 0.2));
        crystallineAnimus = Math.floor(baseCA * (1 + (validatedTier - 1) * 0.3));
      }

      // Ensure player currency record exists
      await storage.ensurePlayerCurrency(userId, 0, 0);

      // [CRITICAL] Persist currency rewards to database
      const updatedCurrency = await storage.addCurrency(userId, arcaneAsh, crystallineAnimus);
      
      // [SECURITY] Track currency gain for anomaly detection
      trackCurrencyGain(userId, arcaneAsh, crystallineAnimus, `${type}_tier${validatedTier}`, req.ip);

      console.log(`[SECURITY] Wilderness reward granted via session ${sessionId}: ${type}, tier=${validatedTier}, AA=${arcaneAsh}, CA=${crystallineAnimus}`);

      res.json({
        success: true,
        type,
        arcaneAsh,
        crystallineAnimus,
        newArcaneAsh: updatedCurrency.arcaneAsh,
        newCrystallineAnimus: updatedCurrency.crystallineAnimus,
      });
    } catch (error) {
      console.error("Error granting wilderness reward:", error);
      res.status(500).json({ message: "Failed to grant reward" });
    }
  });

  /**
   * POST /api/combat/initiate
   * Starts a new combat encounter with server-rolled initiative
   * 
   * [SERVER-AUTHORITATIVE SECURITY FIX]
   * - Accepts only enemy names (strings), not full enemy objects
   * - Creates enemies server-side using EnemyFactory with authoritative stats
   * - Prevents client from spoofing enemy HP/damage
   * 
   * Request body: { enemyNames: string[], isWildEncounter: boolean }
   */
  app.post("/api/combat/initiate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { enemyNames, isWildEncounter } = req.body;

      // [SECURITY] Validate input - accept only enemy names, not full objects
      if (!enemyNames || !Array.isArray(enemyNames)) {
        return res.status(400).json({ message: "enemyNames array required" });
      }

      if (enemyNames.length === 0 || enemyNames.length > 5) {
        return res.status(400).json({ message: "Must have 1-5 enemies" });
      }

      // Validate all enemy names are strings
      if (!enemyNames.every((name: any) => typeof name === 'string')) {
        return res.status(400).json({ message: "All enemy names must be strings" });
      }

      // [SERVER AUTHORITATIVE] Load player data from storage, ignore client payload
      const gameSave = await storage.getGameSaveByUserId(userId);
      if (!gameSave || !gameSave.saveData) {
        return res.status(404).json({ message: "No save found for player" });
      }

      // Handle case where saveData might be a JSON string or object
      const saveData = typeof gameSave.saveData === 'string' 
        ? JSON.parse(gameSave.saveData as string) 
        : gameSave.saveData as any;
      
      // SaveData structure is { player: PlayerData, ... } - extract the player
      const player = saveData.player as PlayerData;
      if (!player) {
        console.error('[COMBAT] No player data found in save');
        return res.status(404).json({ message: "No player data found" });
      }
      
      // Get player level for stats calculation
      const playerCurrencyState = await storage.getPlayerCurrency(userId);
      const playerLevel = playerCurrencyState?.level || 1;
      
      // [SECURITY FIX] Ensure maxHealth/maxStamina are set from server-authoritative level
      player.maxHealth = calculateMaxHealth(playerLevel);
      player.maxStamina = calculateMaxStamina(playerLevel);
      
      // [SECURITY FIX] Recalculate stats from equipment before combat
      // This ensures calculatedEvasion and other stats are correct from armor
      player.stats = recalculatePlayerStats(player.equipment || {}, playerLevel);

      // [SERVER RNG] Create deterministic seed from save data (not Math.random!)
      const userHash = userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const seed = userHash + Date.now();
      
      const rng = new SeededRNG(seed);
      const enemyFactory = new EnemyFactory(rng);

      // [SERVER AUTHORITATIVE] Create enemies using server-side factory
      // This prevents client from spoofing enemy stats
      const enemies: Enemy[] = [];
      for (const enemyName of enemyNames) {
        const enemy = enemyFactory.createEnemyByName(enemyName);
        if (!enemy) {
          return res.status(400).json({ message: `Unknown enemy: ${enemyName}` });
        }
        enemies.push(enemy);
      }

      // Roll initiative and create combat state server-side
      const diceRoller = new DiceRoller(rng);
      const combatSystem = new CombatSystem(diceRoller);
      const combatState = combatSystem.initiateCombat(
        player, 
        enemies,
        isWildEncounter || false
      );

      // [SECURITY] Determine enemy tier and boss status for loot validation
      // Tier is based on the highest tier enemy in the encounter
      // Boss status is true if any enemy is a boss
      const enemyTier = Math.max(...enemies.map(e => e.tier || 1));
      const hasBoss = enemies.some(e => e.isBoss === true);

      // Store combat session with RNG state for deterministic replay
      const sessionId = `${userId}_${Date.now()}`;
      activeCombatSessions.set(sessionId, {
        userId: userId,
        combatState,
        rngSeed: seed,
        rngCalls: rng.getCallCount(),
        // Security: Track server-generated enemy data
        enemyTier,
        hasBoss,
        enemyNames: enemyNames as string[],
      });

      res.json({
        success: true,
        sessionId,
        combatState,
      });
    } catch (error) {
      console.error("Error initiating combat:", error);
      res.status(500).json({ message: "Failed to initiate combat" });
    }
  });

  /**
   * POST /api/combat/action
   * Processes a player action (attack/item/run) server-side
   * 
   * [SERVER-AUTHORITATIVE SECURITY FIX]
   * - Accepts only attackName (string), not full attack objects
   * - Validates attack against player's equipped weapons server-side
   * - Prevents client from forging "999 damage, 0 stamina cost" attacks
   * 
   * Request body: { sessionId: string, action: { type: string, attackName?: string, targetId?: string } }
   */
  app.post("/api/combat/action", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId, action } = req.body;

      // Validate input
      if (!sessionId || !action) {
        return res.status(400).json({ message: "Session ID and action required" });
      }

      // Retrieve combat session
      const session = activeCombatSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Combat session not found or expired" });
      }

      // Prevent session hijacking
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      // Recreate combat system with stored seed for deterministic replay
      const rng = new SeededRNG(session.rngSeed);
      rng.fastForward(session.rngCalls); // Restore RNG state
      const diceRoller = new DiceRoller(rng);
      const combatSystem = new CombatSystem(diceRoller);

      // Process player turn start if this is the first action of the player's turn
      // This ticks player conditions (poison, bleed) at the proper time
      let currentState = session.combatState;
      if (currentState.currentTurn === 'player' && 
          currentState.actionsRemaining === currentState.maxActionsPerTurn &&
          !currentState.turnStartProcessed) {
        currentState = combatSystem.playerTurnStart(currentState);
        currentState.turnStartProcessed = true;
        session.combatState = currentState;
        
        // Check if player died from condition damage
        if (currentState.isComplete) {
          activeCombatSessions.delete(sessionId);
          return res.json({
            success: true,
            combatState: currentState,
            combatEnded: true,
            result: { message: "You succumbed to your conditions..." },
          });
        }
      }

      // Process action server-side
      let updatedState: CombatState;
      let actionResult: any = null;
      
      switch (action.type) {
        case 'attack': {
          // [SECURITY] Validate attack - accept only attackName, not full attack object
          if (!action.attackName || typeof action.attackName !== 'string') {
            return res.status(400).json({ message: "Attack requires attackName (string)" });
          }

          if (!action.targetId) {
            return res.status(400).json({ message: "Attack requires targetId" });
          }
          
          // [SECURITY FIX] Reload fresh player data from storage, don't trust mutable session state
          // This prevents exploits where session state was tampered with earlier
          const gameSave = await storage.getGameSaveByUserId(userId);
          if (!gameSave || !gameSave.saveData) {
            console.error('[COMBAT] Failed to load player save data for attack validation');
            return res.status(500).json({ message: "Failed to load player data" });
          }
          // Handle case where saveData might be a JSON string or object
          const freshSaveData = typeof gameSave.saveData === 'string' 
            ? JSON.parse(gameSave.saveData as string) 
            : gameSave.saveData as any;
          
          // SaveData structure is { player: PlayerData, ... } - extract the player
          const freshPlayer = freshSaveData.player as PlayerData;
          if (!freshPlayer) {
            console.error('[COMBAT] No player data found in save for attack validation');
            return res.status(500).json({ message: "No player data found" });
          }
          
          console.log('[COMBAT DEBUG] Attack validation:', {
            attackName: action.attackName,
            hasEquipment: !!freshPlayer.equipment,
            mainHand: freshPlayer.equipment?.mainHand?.itemId,
            offHand: freshPlayer.equipment?.offHand?.itemId,
          });

          // [SERVER AUTHORITATIVE] Validate attack against fresh player equipment from storage
          // This prevents client from forging attacks with spoofed damage/costs
          const validatedAttack = WeaponValidator.validateAttack(
            action.attackName,
            freshPlayer
          );

          if (!validatedAttack) {
            console.error('[COMBAT] Attack validation failed:', {
              attackName: action.attackName,
              equipment: freshPlayer.equipment,
            });
            return res.status(400).json({ 
              message: `Invalid attack: "${action.attackName}" not found in equipped weapons` 
            });
          }

          // Find target index from targetId
          const targetIndex = session.combatState.enemies.findIndex((e: Enemy) => e.id === action.targetId);
          if (targetIndex === -1) {
            return res.status(400).json({ message: "Target enemy not found" });
          }
          
          // Execute attack using authoritative attack data from server
          const { state, result } = combatSystem.playerAttack(
            session.combatState,
            targetIndex,
            validatedAttack
          );
          
          // AUTO-END TURN: If player has no actions remaining, automatically process enemy turn
          // This is the expected game flow - turns end when all actions are spent
          if (state.actionsRemaining <= 0 && !state.isComplete) {
            console.log('[COMBAT] Auto-ending turn - no actions remaining');
            
            // Transition to enemy turn
            let enemyState = combatSystem.endPlayerTurn(state);
            
            // Process enemy turn phases
            if (enemyState.currentTurn === 'enemy' && !enemyState.isComplete) {
              enemyState = combatSystem.enemyTurnStart(enemyState);
              enemyState = combatSystem.enemyTurn(enemyState);
              enemyState = combatSystem.enemyTurnEnd(enemyState);
              
              // Start new player turn (if combat not over)
              if (!enemyState.isComplete) {
                enemyState = combatSystem.playerTurnStart(enemyState);
              }
            }
            
            updatedState = enemyState;
          } else {
            updatedState = state;
          }
          
          actionResult = result;
          break;
        }

        case 'item':
          return res.status(400).json({ message: "Item usage not yet implemented" });

        case 'run': {
          // Attempt to flee from combat
          // Save current combat state (stamina/HP spent) before allowing escape
          await finalizeAbandonedCombat(session);
          
          // Clean up combat session
          activeCombatSessions.delete(sessionId);
          
          // Mark combat as fled (player didn't win, but escaped)
          const fledState: CombatState = {
            ...session.combatState,
            isComplete: true,
            playerVictory: false,
          };
          
          return res.json({
            success: true,
            combatState: fledState,
            combatEnded: true,
            fled: true,
            result: { message: "You fled from combat! Your stamina and health costs remain." },
          });
        }

        case 'end_turn': {
          // End player turn and process all enemy turns
          let state = combatSystem.endPlayerTurn(session.combatState);
          
          // Process all enemy turns (enemyTurn handles all enemies and transitions back to player)
          if (state.currentTurn === 'enemy' && !state.isComplete) {
            state = combatSystem.enemyTurn(state);
          }
          
          updatedState = state;
          actionResult = { success: true };
          break;
        }

        default:
          return res.status(400).json({ message: "Invalid action type" });
      }

      // Update session with new combat state and RNG call count
      session.combatState = updatedState;
      session.rngCalls = rng.getCallCount();
      activeCombatSessions.set(sessionId, session);

      // Check if combat ended
      const combatEnded = combatSystem.isCombatComplete(updatedState);

      if (combatEnded) {
        // [SECURITY] Check if player won (all enemies defeated)
        const playerWon = updatedState.enemies.every((e: Enemy) => e.health <= 0);
        
        if (playerWon) {
          // Create loot entitlement - ONLY way to legitimately claim loot
          createLootEntitlement(session, sessionId);
          console.log(`[SECURITY] Combat victory for ${userId} - loot entitlement created`);
        }
        
        // Clean up session
        activeCombatSessions.delete(sessionId);
      }

      res.json({
        success: true,
        combatState: updatedState,
        combatEnded,
        sessionId, // Include sessionId for loot claiming
        result: actionResult,
      });
    } catch (error) {
      console.error("Error processing combat action:", error);
      res.status(500).json({ message: "Failed to process action" });
    }
  });

  /**
   * POST /api/combat/end-turn
   * Processes all enemy AI turns server-side
   */
  app.post("/api/combat/end-turn", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.body;

      // Validate input
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID required" });
      }

      // Retrieve combat session
      const session = activeCombatSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Combat session not found or expired" });
      }

      // Prevent session hijacking
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      // Recreate combat system with stored seed for deterministic replay
      const rng = new SeededRNG(session.rngSeed);
      rng.fastForward(session.rngCalls); // Restore RNG state
      const diceRoller = new DiceRoller(rng);
      const combatSystem = new CombatSystem(diceRoller);

      // CRITICAL FIX: Must call endPlayerTurn first to transition currentTurn from 'player' to 'enemy'
      // Otherwise enemyTurn() checks currentTurn !== 'enemy' and returns without processing
      let state = combatSystem.endPlayerTurn(session.combatState);
      
      // Process enemy turn phases in order:
      // 1. enemyTurnStart - tick poison conditions on enemies
      state = combatSystem.enemyTurnStart(state);
      
      // 2. enemyTurn - each enemy attacks the player (only runs if currentTurn === 'enemy')
      state = combatSystem.enemyTurn(state);
      
      // 3. enemyTurnEnd - tick bleed conditions on enemies
      state = combatSystem.enemyTurnEnd(state);
      
      // 4. Start new player turn
      const updatedState = combatSystem.playerTurnStart(state);

      // Update session with new combat state and RNG call count
      session.combatState = updatedState;
      session.rngCalls = rng.getCallCount();
      activeCombatSessions.set(sessionId, session);

      // Check if combat ended
      const combatEnded = combatSystem.isCombatComplete(updatedState);

      if (combatEnded) {
        // [SECURITY] Check if player won (all enemies defeated)
        const playerWon = updatedState.enemies.every((e: Enemy) => e.health <= 0);
        
        if (playerWon) {
          // Create loot entitlement - ONLY way to legitimately claim loot
          createLootEntitlement(session, sessionId);
          console.log(`[SECURITY] Combat victory for ${userId} - loot entitlement created`);
        }
        
        // Clean up session
        activeCombatSessions.delete(sessionId);
      }

      res.json({
        success: true,
        combatState: updatedState,
        combatEnded,
        sessionId, // Include sessionId for loot claiming
      });
    } catch (error) {
      console.error("Error processing enemy turns:", error);
      res.status(500).json({ message: "Failed to process enemy turns" });
    }
  });

  /**
   * GET /api/combat/state/:sessionId
   * Retrieves current combat state for a session
   */
  app.get("/api/combat/state/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      const session = activeCombatSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Combat session not found" });
      }

      // Prevent session hijacking
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      res.json({
        success: true,
        combatState: session.combatState,
      });
    } catch (error) {
      console.error("Error retrieving combat state:", error);
      res.status(500).json({ message: "Failed to retrieve combat state" });
    }
  });

  /**
   * DELETE /api/combat/:sessionId
   * Ends/abandons a combat session
   * 
   * [ANTI-EXPLOIT] Saves player state before cleanup to prevent stamina exploitation
   * When combat is abandoned (disconnect, browser close, explicit abandon), 
   * the stamina/HP costs from combat are persisted.
   */
  app.delete("/api/combat/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      const session = activeCombatSessions.get(sessionId);
      if (session && session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      // Save combat state before abandonment to persist stamina/HP costs
      if (session) {
        await finalizeAbandonedCombat(session);
      }

      const existed = activeCombatSessions.delete(sessionId);

      res.json({
        success: true,
        existed,
        message: existed ? "Combat abandoned - stamina and health costs saved" : "Session not found",
      });
    } catch (error) {
      console.error("Error ending combat session:", error);
      res.status(500).json({ message: "Failed to end combat session" });
    }
  });
}
