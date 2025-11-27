// Loot generation API routes - server-authoritative loot system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { LootEngine } from "../systems/LootEngine";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
import { calculateMaxHealth, calculateMaxStamina } from "../security";
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
    console.log('[Loot API] Received request:', JSON.stringify(req.body));
    try {
      const userId = req.user.claims.sub;
      const { enemyName, tier, isBoss, playerLevel } = req.body;
      console.log(`[Loot API] User: ${userId}, Enemy: ${enemyName}, Tier: ${tier}, Boss: ${isBoss}`);

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
      
      // Calculate CA reward using probability to maintain integer database storage
      // Average CA per enemy = 0.3 × tier, achieved through probability:
      // - T1: 30% chance of 1 CA (avg 0.3)
      // - T2: 60% chance of 1 CA (avg 0.6)
      // - T3: 90% chance of 1 CA (avg 0.9)
      // - T4: 100% chance of 1 CA + 20% chance of bonus (avg 1.2)
      // - T5: 100% chance of 1 CA + 50% chance of bonus (avg 1.5)
      // Bosses get 3× CA
      let crystallineAnimus = 0;
      const caChance = 0.3 * tier; // Base chance: 0.3, 0.6, 0.9, 1.2, 1.5
      
      if (caChance >= 1) {
        // Guaranteed 1 CA plus chance for bonus
        crystallineAnimus = 1;
        const bonusChance = caChance - 1; // 0.2 for T4, 0.5 for T5
        if (rng.next('CA_bonus_roll') < bonusChance) {
          crystallineAnimus += 1;
        }
      } else {
        // Probability-based single CA
        if (rng.next('CA_roll') < caChance) {
          crystallineAnimus = 1;
        }
      }
      
      // Bosses give 3× CA
      if (isBoss) {
        crystallineAnimus *= 3;
      }
      
      console.log(`[Loot Roll] Enemy: ${enemyName}, Tier: ${tier}, Boss: ${isBoss}, AA: ${arcaneAsh}, CA: ${crystallineAnimus}`);
      
      // Calculate XP reward using LootEngine (T1 mob = 5 XP, T1 boss = 15 XP, scales with tier)
      const xpReward = lootEngine.rollExperienceReward(tier, isBoss || false);

      // CRITICAL: Ensure player currency record exists before adding rewards
      await storage.ensurePlayerCurrency(userId, 0, 0);
      
      // CRITICAL: Persist currency rewards (both AA and CA) to database immediately
      // This ensures the reward survives the save/load security sanitization
      const updatedCurrency = await storage.addCurrency(userId, arcaneAsh, crystallineAnimus);
      
      // CRITICAL: Persist XP reward to database immediately
      const xpResult = await storage.grantExperience(userId, xpReward);

      // Calculate new max stats based on new level (for level-up updates)
      const newMaxHealth = xpResult.leveledUp ? calculateMaxHealth(xpResult.newLevel) : null;
      const newMaxStamina = xpResult.leveledUp ? calculateMaxStamina(xpResult.newLevel) : null;

      const responseData = {
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
        newMaxHealth,
        newMaxStamina,
        newArcaneAsh: updatedCurrency.arcaneAsh,
        newCrystallineAnimus: updatedCurrency.crystallineAnimus,
      };
      console.log('[Loot API] Sending response:', JSON.stringify(responseData));
      res.json(responseData);
    } catch (error) {
      console.error("Error rolling loot:", error);
      res.status(500).json({ message: "Failed to roll loot" });
    }
  });
}
