// API routes for game save/load and authentication
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";

// Session tracking for multi-instance detection
interface SessionInfo {
  playerId: string;
  sessionId: string;
  lastHeartbeat: number;
}

const activeSessions = new Map<string, SessionInfo[]>();
const SESSION_TIMEOUT = 15000; // 15 seconds

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

  // Get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Load game save - supports both authenticated users and anonymous sessions
  app.get("/api/game/load", async (req: any, res) => {
    try {
      let gameSave;
      
      // Try authenticated user first
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
        const userId = req.user.claims.sub;
        gameSave = await storage.getGameSaveByUserId(userId);
      }
      
      // Fall back to session ID from header
      if (!gameSave) {
        const sessionId = req.headers['x-session-id'];
        if (sessionId) {
          gameSave = await storage.getGameSaveBySessionId(sessionId as string);
        }
      }
      
      if (!gameSave) {
        return res.status(404).json({ message: "No save found" });
      }
      
      res.json({
        saveData: gameSave.saveData,
        lastSaved: gameSave.lastSaved
      });
    } catch (error) {
      console.error("Error loading game:", error);
      res.status(500).json({ message: "Failed to load game" });
    }
  });

  // Save game state - supports both authenticated users and anonymous sessions
  app.post("/api/game/save", async (req: any, res) => {
    try {
      const { saveData } = req.body;
      
      if (!saveData) {
        return res.status(400).json({ message: "Save data required" });
      }
      
      let userId: string | undefined;
      let sessionId: string | undefined;
      
      // Use authenticated userId if available
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
        userId = req.user.claims.sub;
      } else {
        // Otherwise use session ID from header
        sessionId = req.headers['x-session-id'] as string;
        if (!sessionId) {
          return res.status(400).json({ message: "Session ID required" });
        }
      }
      
      const result = await storage.saveGame({
        userId,
        sessionId,
        saveData,
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

  // Helper to get playerId from request (userId or sessionId)
  const getPlayerId = (req: any): string | null => {
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
      return req.user.claims.sub;
    }
    const sessionId = req.headers['x-session-id'];
    return sessionId ? sessionId as string : null;
  };

  // Heartbeat endpoint for multi-instance detection
  app.post("/api/game/heartbeat", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      const clientSessionId = req.body.sessionId;
      
      if (!playerId || !clientSessionId) {
        return res.status(400).json({ message: "Player ID and session ID required" });
      }

      const now = Date.now();
      
      // Get or create session list for this player
      let sessions = activeSessions.get(playerId) || [];
      
      // Find existing session or add new one
      const existingSession = sessions.find(s => s.sessionId === clientSessionId);
      if (existingSession) {
        existingSession.lastHeartbeat = now;
      } else {
        sessions.push({ playerId, sessionId: clientSessionId, lastHeartbeat: now });
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

  // Soulbinding endpoints
  app.get("/api/soulbound/slots", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

      const slots = await storage.getSoulboundSlots(playerId);
      res.json({ slots: slots.map(s => s.slotName) });
    } catch (error) {
      console.error("Error fetching soulbound slots:", error);
      res.status(500).json({ message: "Failed to fetch soulbound slots" });
    }
  });

  app.post("/api/soulbound/slots", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

      const { slots } = req.body;
      if (!Array.isArray(slots)) {
        return res.status(400).json({ message: "Slots must be an array" });
      }

      await storage.setSoulboundSlots(playerId, slots);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting soulbound slots:", error);
      res.status(500).json({ message: "Failed to set soulbound slots" });
    }
  });

  // Tombstone endpoints
  app.post("/api/tombstones/create", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

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

  app.get("/api/tombstones/mine", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

      const tombstones = await storage.getPlayerTombstones(playerId);
      res.json({ tombstones });
    } catch (error) {
      console.error("Error fetching player tombstones:", error);
      res.status(500).json({ message: "Failed to fetch tombstones" });
    }
  });

  app.get("/api/tombstones/random", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

      const tombstone = await storage.getRandomTombstone(playerId);
      res.json({ tombstone: tombstone || null });
    } catch (error) {
      console.error("Error fetching random tombstone:", error);
      res.status(500).json({ message: "Failed to fetch random tombstone" });
    }
  });

  app.post("/api/tombstones/:id/loot", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

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

  app.delete("/api/tombstones/:id", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

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

  // Karma/return endpoints
  app.get("/api/karma/looted-tombstones", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

      const tombstones = await storage.getLootedTombstones(playerId);
      res.json({ tombstones });
    } catch (error) {
      console.error("Error getting looted tombstones:", error);
      res.status(500).json({ message: "Failed to get looted tombstones" });
    }
  });

  app.post("/api/karma/return", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

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

  app.get("/api/karma/pending", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

      const pending = await storage.getPendingReturns(playerId);
      res.json({ pending });
    } catch (error) {
      console.error("Error fetching pending returns:", error);
      res.status(500).json({ message: "Failed to fetch pending returns" });
    }
  });

  app.post("/api/karma/claim/:id", async (req: any, res) => {
    try {
      const playerId = getPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ message: "Player ID required" });
      }

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

  const httpServer = createServer(app);
  return httpServer;
}
