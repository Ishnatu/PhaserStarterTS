// Loot generation API routes - server-authoritative loot system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { LootEngine } from "../systems/LootEngine";
import { SeededRNG } from "../utils/SeededRNG";
import type { InventoryItem } from "../../shared/types";

export function registerLootRoutes(app: Express) {
  /**
   * POST /api/loot/roll
   * Server-side loot generation for combat victories
   * Accepts enemy tier/boss flag, returns items with enhancement levels
   * SERVER-AUTHORITATIVE: All loot rolls happen server-side with seeded RNG
   */
  app.post("/api/loot/roll", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { enemyName, tier, isBoss, playerLevel } = req.body;

      // Validate input
      if (!enemyName || typeof tier !== 'number') {
        return res.status(400).json({ message: "Invalid loot roll data: enemyName and tier required" });
      }

      if (tier < 1 || tier > 5) {
        return res.status(400).json({ message: "Tier must be between 1 and 5" });
      }

      // [SERVER RNG] Create deterministic seed for loot generation
      // Combines userId hash + timestamp + tier for unique but deterministic loot
      const userHash = userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const seed = userHash + Date.now() + (tier * 100);
      
      const rng = new SeededRNG(seed);
      const lootEngine = new LootEngine(rng);

      // Generate loot server-side
      const items = lootEngine.rollLoot(tier, isBoss || false);
      const arcaneAsh = lootEngine.rollCurrencyReward(tier, isBoss || false);

      res.json({
        success: true,
        loot: {
          items,
          arcaneAsh,
        },
        rngSeed: seed, // Return seed for debugging/audit purposes
      });
    } catch (error) {
      console.error("Error rolling loot:", error);
      res.status(500).json({ message: "Failed to roll loot" });
    }
  });
}
