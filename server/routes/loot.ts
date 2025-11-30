// Loot generation API routes - server-authoritative loot system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { LootEngine } from "../systems/LootEngine";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
import { calculateMaxHealth, calculateMaxStamina, logSecurityEvent } from "../security";
import { getActiveDelveSession } from "./delve";
import { consumeWildernessEncounterLoot } from "./combat";
import type { InventoryItem } from "../../shared/types";

/**
 * Per-player loot claim tracking for rate anomaly detection
 * Tracks kill counts per session to detect impossible kill rates
 */
interface LootClaimTracker {
  claimsInWindow: number;
  windowStart: number;
  lastTier: number;
}

const lootClaimTrackers = new Map<string, LootClaimTracker>();
const CLAIM_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_CLAIMS_PER_MINUTE = 8; // Max realistic kills in 1 minute of combat

export function registerLootRoutes(app: Express) {
  /**
   * POST /api/loot/roll
   * Server-side loot generation for combat victories
   * 
   * [SECURITY FIX] Session-based validation:
   * 1. For delve combat: Requires sessionId starting with "delve_"
   * 2. For wilderness combat: Requires sessionId starting with "wild_"
   * 3. NO FALLBACK - session is mandatory to prevent spoofing
   * 
   * NOTE: Full server-authoritative combat planned for future migration
   * This is an interim security fix to work with client-side combat
   * 
   * SERVER-AUTHORITATIVE: All loot rolls happen server-side with seeded RNG
   * CRITICAL: Currency and XP rewards are persisted to database immediately
   */
  app.post("/api/loot/roll", isAuthenticated, async (req: any, res) => {
    console.log('[Loot API] Received request:', JSON.stringify(req.body));
    try {
      const userId = req.user.claims.sub;
      const { 
        sessionId,
        enemyName: claimedEnemyName, 
        tier: claimedTier, 
        isBoss: claimedIsBoss,
        playerLevel 
      } = req.body;
      
      // [SECURITY] Require sessionId for all loot claims
      if (!sessionId) {
        logSecurityEvent(userId, 'LOOT_NO_SESSION', 'CRITICAL', {
          message: 'Loot claim without sessionId - EXPLOIT ATTEMPT',
          ip: req.ip,
          body: req.body,
        });
        return res.status(403).json({ message: "Session ID required - register encounter before combat" });
      }
      
      // [SECURITY] Track loot claims for anomaly detection
      const now = Date.now();
      let tracker = lootClaimTrackers.get(userId);
      
      if (!tracker || now - tracker.windowStart > CLAIM_WINDOW_MS) {
        tracker = { claimsInWindow: 0, windowStart: now, lastTier: claimedTier || 1 };
      }
      
      tracker.claimsInWindow++;
      lootClaimTrackers.set(userId, tracker);
      
      // [SECURITY] Detect anomalous claim rates
      if (tracker.claimsInWindow > MAX_CLAIMS_PER_MINUTE) {
        logSecurityEvent(userId, 'LOOT_RATE_ANOMALY', 'HIGH', {
          message: `Excessive loot claims: ${tracker.claimsInWindow} in ${CLAIM_WINDOW_MS}ms`,
          ip: req.ip,
          claimsInWindow: tracker.claimsInWindow,
        });
      }
      
      // [SECURITY] Validate enemy tier based on session type
      let validatedTier: number;
      let validatedIsBoss: boolean;
      let validatedEnemyName: string = claimedEnemyName || 'Unknown Enemy';
      
      if (sessionId.startsWith('delve_')) {
        // DELVE COMBAT: Validate against active delve session
        const delveSession = getActiveDelveSession(userId, sessionId);
        
        if (!delveSession) {
          logSecurityEvent(userId, 'LOOT_INVALID_DELVE_SESSION', 'CRITICAL', {
            message: 'Loot claim with invalid/expired delve sessionId - EXPLOIT ATTEMPT',
            ip: req.ip,
            sessionId,
            claimedTier,
          });
          return res.status(403).json({ message: "Invalid delve session - delve not found or expired" });
        }
        
        // Clamp tier to delve tier (can't fight T3 enemies in T1 delve)
        validatedTier = Math.min(claimedTier || 1, delveSession.tier);
        validatedIsBoss = claimedIsBoss || false;
        
        // Log tier mismatch as potential exploit attempt
        if (claimedTier > delveSession.tier) {
          logSecurityEvent(userId, 'LOOT_TIER_MISMATCH', 'MEDIUM', {
            message: `Claimed tier ${claimedTier} exceeds delve tier ${delveSession.tier}`,
            ip: req.ip,
            sessionId,
            claimedTier,
            delveTier: delveSession.tier,
          });
        }
      } else if (sessionId.startsWith('wild_')) {
        // WILDERNESS COMBAT: Validate against wilderness encounter session
        const wildSession = consumeWildernessEncounterLoot(userId, sessionId);
        
        if (!wildSession) {
          logSecurityEvent(userId, 'LOOT_INVALID_WILD_SESSION', 'CRITICAL', {
            message: 'Loot claim with invalid/expired wilderness sessionId - EXPLOIT ATTEMPT',
            ip: req.ip,
            sessionId,
            claimedTier,
          });
          return res.status(403).json({ message: "Invalid wilderness session - encounter not found, expired, or all enemies already looted" });
        }
        
        // Use server-validated tier from session
        validatedTier = wildSession.tier;
        validatedIsBoss = wildSession.isBoss;
        
        // Log tier mismatch
        if (claimedTier > validatedTier) {
          logSecurityEvent(userId, 'LOOT_TIER_MISMATCH_WILD', 'MEDIUM', {
            message: `Claimed tier ${claimedTier} exceeds validated wild tier ${validatedTier}`,
            ip: req.ip,
            sessionId,
            claimedTier,
            validatedTier,
          });
        }
      } else {
        // Unknown session type
        logSecurityEvent(userId, 'LOOT_UNKNOWN_SESSION_TYPE', 'CRITICAL', {
          message: `Unknown session type: ${sessionId.substring(0, 10)}... - EXPLOIT ATTEMPT`,
          ip: req.ip,
          sessionId,
        });
        return res.status(403).json({ message: "Invalid session type" });
      }
      
      console.log(`[Loot API] Validated: User: ${userId}, Enemy: ${validatedEnemyName}, Tier: ${validatedTier} (claimed: ${claimedTier}), Boss: ${validatedIsBoss}`);

      // [SERVER RNG] Create deterministic seed for loot generation
      // Combines userId hash + timestamp + tier for unique but deterministic loot
      const userHash = userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const seed = userHash + Date.now() + (validatedTier * 100);
      
      const rng = new SeededRNG(seed);
      const lootEngine = new LootEngine(rng);

      // Generate loot server-side using VALIDATED tier
      const items = lootEngine.rollLoot(validatedTier, validatedIsBoss);
      const arcaneAsh = lootEngine.rollCurrencyReward(validatedTier, validatedIsBoss);
      
      // Calculate CA reward using probability to maintain integer database storage
      // Average CA per enemy = 0.3 × tier, achieved through probability:
      // - T1: 30% chance of 1 CA (avg 0.3)
      // - T2: 60% chance of 1 CA (avg 0.6)
      // - T3: 90% chance of 1 CA (avg 0.9)
      // - T4: 100% chance of 1 CA + 20% chance of bonus (avg 1.2)
      // - T5: 100% chance of 1 CA + 50% chance of bonus (avg 1.5)
      // Bosses get 3× CA
      let crystallineAnimus = 0;
      const caChance = 0.3 * validatedTier; // Base chance: 0.3, 0.6, 0.9, 1.2, 1.5
      
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
      if (validatedIsBoss) {
        crystallineAnimus *= 3;
      }
      
      console.log(`[Loot Roll] Enemy: ${validatedEnemyName}, Tier: ${validatedTier}, Boss: ${validatedIsBoss}, AA: ${arcaneAsh}, CA: ${crystallineAnimus}`);
      
      // Calculate XP reward using LootEngine (T1 mob = 5 XP, T1 boss = 15 XP, scales with tier)
      const xpReward = lootEngine.rollExperienceReward(validatedTier, validatedIsBoss);

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
