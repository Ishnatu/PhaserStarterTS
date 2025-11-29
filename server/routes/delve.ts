// Delve generation API routes - server-authoritative delve system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { DelveGenerator } from "../systems/DelveGenerator";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
import { calculateMaxHealth, calculateMaxStamina } from "../security";
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

      res.json({
        success: true,
        delve: {
          rooms: Array.from(delve.rooms.values()),
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
   * SERVER-AUTHORITATIVE: XP and delve count are persisted to database immediately
   */
  app.post("/api/delve/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tier } = req.body;

      // Validate input
      if (typeof tier !== 'number' || tier < 1 || tier > 5) {
        return res.status(400).json({ message: "Invalid tier: must be between 1 and 5" });
      }

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
}
