// Loot generation API routes - server-authoritative loot system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { LootEngine } from "../systems/LootEngine";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
import type { InventoryItem } from "../../shared/types";

export function registerLootRoutes(app: Express) {
  /**
   * POST /api/loot/roll
   * Server-side loot generation for combat victories
   * Accepts enemy tier/boss flag, returns items with enhancement levels
   * SERVER-AUTHORITATIVE: All loot rolls happen server-side with seeded RNG
   * CRITICAL: Currency and XP rewards are persisted to database immediately
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
      
      // Calculate CA reward: 0.3 × tier per enemy
      const crystallineAnimus = 0.3 * tier;
      
      // Calculate XP reward using LootEngine (T1 mob = 5 XP, T1 boss = 15 XP, scales with tier)
      const xpReward = lootEngine.rollExperienceReward(tier, isBoss || false);

      // CRITICAL: Ensure player currency record exists before adding rewards
      await storage.ensurePlayerCurrency(userId, 0, 0);
      
      // CRITICAL: Persist currency rewards (both AA and CA) to database immediately
      // This ensures the reward survives the save/load security sanitization
      const updatedCurrency = await storage.addCurrency(userId, arcaneAsh, crystallineAnimus);
      
      // CRITICAL: Persist XP reward to database immediately
      const xpResult = await storage.grantExperience(userId, xpReward);

      res.json({
        success: true,
        loot: {
          items,
          arcaneAsh,
          crystallineAnimus,
        },
        xpReward,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.newLevel,
        newExperience: xpResult.newExperience,
        newArcaneAsh: updatedCurrency.arcaneAsh,
        newCrystallineAnimus: updatedCurrency.crystallineAnimus,
      });
    } catch (error) {
      console.error("Error rolling loot:", error);
      res.status(500).json({ message: "Failed to roll loot" });
    }
  });
}
