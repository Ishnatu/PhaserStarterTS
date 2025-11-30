// Delve generation API routes - server-authoritative delve system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { DelveGenerator } from "../systems/DelveGenerator";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
import { calculateMaxHealth, calculateMaxStamina, logSecurityEvent } from "../security";
import type { DelveRoom } from "../../shared/types";

// Delve completion XP rewards per tier (matches client-side xpSystem.ts)
const DELVE_COMPLETION_XP: Record<number, number> = {
  1: 25,
  2: 38,
  3: 57,
  4: 83,
  5: 125,
};

// Trap disarm XP rewards per tier (matches client-side xpSystem.ts)
const TRAP_DISARM_XP: Record<number, number> = {
  1: 5,
  2: 8,
  3: 11,
  4: 17,
  5: 25,
};

/**
 * [SECURITY] Active delve sessions - tracks server-generated delves
 * Prevents players from claiming completion rewards for delves they never started
 */
interface ActiveDelveSession {
  userId: string;
  tier: number;
  roomCount: number;
  createdAt: number;
  completed: boolean;
}

const activeDelves = new Map<string, ActiveDelveSession>();

// Cleanup old delve sessions (30 minute expiry - delves shouldn't take longer)
const DELVE_SESSION_EXPIRY_MS = 30 * 60 * 1000;

function cleanupExpiredDelveSessions() {
  const now = Date.now();
  for (const [key, session] of activeDelves) {
    if (now - session.createdAt > DELVE_SESSION_EXPIRY_MS || session.completed) {
      activeDelves.delete(key);
    }
  }
}

/**
 * Validate and consume a delve session for completion
 * Returns the tier if valid, null if invalid/consumed
 */
function consumeDelveSession(userId: string, sessionId: string): number | null {
  cleanupExpiredDelveSessions();
  
  const session = activeDelves.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  if (session.userId !== userId) {
    return null;
  }
  
  if (session.completed) {
    return null;
  }
  
  // Mark as completed to prevent replay
  session.completed = true;
  activeDelves.set(sessionId, session);
  
  return session.tier;
}

/**
 * [SECURITY] Check if a delve session is active (non-destructive)
 * Used by loot route to validate enemy tier during delve combat
 * Returns the tier if valid, null if session doesn't exist or is invalid
 */
export function getActiveDelveSession(userId: string, sessionId: string): { tier: number; roomCount: number } | null {
  cleanupExpiredDelveSessions();
  
  const session = activeDelves.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  if (session.userId !== userId) {
    return null;
  }
  
  if (session.completed) {
    return null;
  }
  
  return { tier: session.tier, roomCount: session.roomCount };
}

export function registerDelveRoutes(app: Express) {
  /**
   * POST /api/delve/generate
   * Creates a procedural delve server-side with room types, traps, and encounters
   * SERVER-AUTHORITATIVE: Delve generation happens on server with seeded RNG
   */
  app.post("/api/delve/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tier } = req.body;

      // Validate input
      if (typeof tier !== 'number') {
        return res.status(400).json({ message: "Invalid delve generation data: tier required" });
      }

      if (tier < 1 || tier > 5) {
        return res.status(400).json({ message: "Tier must be between 1 and 5" });
      }

      // [SERVER RNG] Create deterministic seed for delve generation
      // Combines userId hash + timestamp + tier for unique delves
      const userHash = userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const seed = userHash + Date.now() + (tier * 1000);
      
      const rng = new SeededRNG(seed);
      const delveGenerator = new DelveGenerator(rng);

      // Generate delve server-side
      const delve = delveGenerator.generateDelve(tier);
      const rooms = Array.from(delve.rooms.values());

      // [SECURITY] Create delve session to track this delve
      const sessionId = `delve_${userId}_${Date.now()}`;
      activeDelves.set(sessionId, {
        userId,
        tier,
        roomCount: rooms.length,
        createdAt: Date.now(),
        completed: false,
      });
      console.log(`[SECURITY] Created delve session ${sessionId} for tier ${tier}`);

      res.json({
        success: true,
        sessionId, // Return sessionId for completion verification
        delve: {
          rooms,
          entranceRoomId: delve.entranceRoomId,
          tier: delve.tier,
        },
      });
    } catch (error) {
      console.error("Error generating delve:", error);
      res.status(500).json({ message: "Failed to generate delve" });
    }
  });

  /**
   * POST /api/delve/complete
   * Grants XP reward for completing a delve and tracks delve count
   * 
   * [SECURITY FIX] Now requires a valid sessionId from delve generation
   * Delve sessions are created when a delve is generated server-side
   * This prevents attackers from claiming completion rewards for arbitrary tiers
   * 
   * SERVER-AUTHORITATIVE: XP and delve count are persisted to database immediately
   */
  app.post("/api/delve/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.body;

      // [SECURITY] Require sessionId to complete delve
      if (!sessionId) {
        logSecurityEvent(userId, 'DELVE_NO_SESSION', 'HIGH', {
          message: 'Delve completion attempted without sessionId - possible exploit attempt',
          ip: req.ip,
          body: req.body,
        });
        return res.status(400).json({ message: "Session ID required to complete delve" });
      }

      // [SECURITY] Consume delve session - verifies delve was generated server-side
      const validatedTier = consumeDelveSession(userId, sessionId);

      if (validatedTier === null) {
        logSecurityEvent(userId, 'DELVE_INVALID_SESSION', 'CRITICAL', {
          message: 'Delve completion with invalid/consumed session - EXPLOIT ATTEMPT',
          ip: req.ip,
          sessionId,
          body: req.body,
        });
        return res.status(403).json({ message: "Invalid delve completion - no valid delve session found" });
      }

      // [SECURITY] Use server-stored tier, NOT client input
      const tier = validatedTier;
      console.log(`[SECURITY] Delve completion verified for ${userId}: tier=${tier}`);

      // Get XP reward for this tier
      const xpReward = DELVE_COMPLETION_XP[tier];
      if (!xpReward) {
        return res.status(400).json({ message: "Invalid tier" });
      }

      // Ensure player currency record exists
      await storage.ensurePlayerCurrency(userId, 0, 0);

      // Grant XP server-side (persisted to database)
      const xpResult = await storage.grantExperience(userId, xpReward);

      // Increment delve count for this tier (server-authoritative)
      const delveProgress = await storage.incrementDelveCount(userId, tier);

      // Calculate new max stats if leveled up
      const newMaxHealth = xpResult.leveledUp ? calculateMaxHealth(xpResult.newLevel) : null;
      const newMaxStamina = xpResult.leveledUp ? calculateMaxStamina(xpResult.newLevel) : null;

      res.json({
        success: true,
        xpReward,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.newLevel,
        newExperience: xpResult.newExperience,
        newMaxHealth,
        newMaxStamina,
        delvesCompletedByTier: delveProgress,
      });
    } catch (error) {
      console.error("Error completing delve:", error);
      res.status(500).json({ message: "Failed to complete delve" });
    }
  });

  /**
   * POST /api/delve/trap
   * Grants XP reward for successfully disarming a trap
   * SERVER-AUTHORITATIVE: XP is persisted to database immediately
   */
  app.post("/api/delve/trap", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tier } = req.body;

      // Validate input
      if (typeof tier !== 'number' || tier < 1 || tier > 5) {
        return res.status(400).json({ message: "Invalid tier: must be between 1 and 5" });
      }

      // Get XP reward for this tier
      const xpReward = TRAP_DISARM_XP[tier];
      if (!xpReward) {
        return res.status(400).json({ message: "Invalid tier" });
      }

      // Ensure player currency record exists
      await storage.ensurePlayerCurrency(userId, 0, 0);

      // Grant XP server-side (persisted to database)
      const xpResult = await storage.grantExperience(userId, xpReward);

      // Calculate new max stats if leveled up
      const newMaxHealth = xpResult.leveledUp ? calculateMaxHealth(xpResult.newLevel) : null;
      const newMaxStamina = xpResult.leveledUp ? calculateMaxStamina(xpResult.newLevel) : null;

      res.json({
        success: true,
        xpReward,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.newLevel,
        newExperience: xpResult.newExperience,
        newMaxHealth,
        newMaxStamina,
      });
    } catch (error) {
      console.error("Error granting trap XP:", error);
      res.status(500).json({ message: "Failed to grant trap XP" });
    }
  });

  /**
   * POST /api/delve/treasure
   * Grants currency reward for collecting treasure from a treasure room
   * SERVER-AUTHORITATIVE: Currency is persisted atomically to database
   * Reward: 50 AA per tier + 1 CA per tier
   */
  app.post("/api/delve/treasure", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tier, sessionId, roomId } = req.body;

      // Validate input
      if (typeof tier !== 'number' || tier < 1 || tier > 5) {
        logSecurityEvent(userId, 'DELVE_INVALID_TIER', 'MEDIUM', {
          tier, sessionId, roomId,
        });
        return res.status(400).json({ message: "Invalid tier: must be between 1 and 5" });
      }

      // Validate session if provided (optional - for enhanced security)
      if (sessionId) {
        const session = getActiveDelveSession(userId, sessionId);
        if (!session) {
          logSecurityEvent(userId, 'DELVE_TREASURE_INVALID_SESSION', 'MEDIUM', {
            tier, sessionId, roomId,
          });
          return res.status(400).json({ message: "Invalid or expired delve session" });
        }
        // Clamp claimed tier to session tier to prevent tier inflation
        if (tier > session.tier) {
          logSecurityEvent(userId, 'DELVE_TREASURE_TIER_MANIPULATION', 'HIGH', {
            claimedTier: tier, sessionTier: session.tier, sessionId,
          });
        }
      }

      // Calculate rewards: 50 AA per tier, 1 CA per tier (always integer)
      const arcaneAshReward = 50 * tier;
      const crystallineAnimusReward = tier;

      // Ensure player currency record exists
      await storage.ensurePlayerCurrency(userId, 0, 0);

      // Grant currency atomically using addCurrency
      const currencies = await storage.addCurrency(userId, arcaneAshReward, crystallineAnimusReward);

      logSecurityEvent(userId, 'DELVE_TREASURE_COLLECTED', 'LOW', { 
        tier, 
        arcaneAshReward, 
        crystallineAnimusReward,
        newBalance: { arcaneAsh: currencies.arcaneAsh, crystallineAnimus: currencies.crystallineAnimus },
      });

      res.json({
        success: true,
        arcaneAshReward,
        crystallineAnimusReward,
        arcaneAsh: currencies.arcaneAsh,
        crystallineAnimus: currencies.crystallineAnimus,
      });
    } catch (error) {
      console.error("Error collecting treasure:", error);
      res.status(500).json({ message: "Failed to collect treasure" });
    }
  });
}
