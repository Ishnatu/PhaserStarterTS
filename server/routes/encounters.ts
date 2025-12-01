import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { logSecurityEvent } from "../security";
import { SeededRNG } from "../utils/SeededRNG";
import { pendingEncounterManager } from "../encounters/PendingEncounterManager";
import { validateBody } from "../validation/middleware";
import { TrapAttemptSchema, TreasureClaimSchema, ShrineOfferSchema, EncounterTokenSchema } from "../validation/schemas";

/**
 * ECONOMIC SECURITY: Daily earning caps and tracking
 * Prevents multi-account farming and bot exploitation
 */
interface DailyEarnings {
  date: string; // YYYY-MM-DD
  trapAttemptsToday: number;
  treasureClaimsToday: number;
  shrineOffersToday: number;
  aaEarnedToday: number;
  caEarnedToday: number;
}

const playerDailyEarnings = new Map<string, DailyEarnings>();

// Daily caps - designed to require ~2 hours of active play to hit
const DAILY_CAPS = {
  trapAttempts: 10,        // Max 10 trap attempts per day
  treasureClaims: 8,       // Max 8 treasure claims per day (now requires combat)
  shrineOffers: 5,         // Max 5 shrine offers per day
  aaPerLevel: 1000,        // AA cap scales with level: 1000 per character level
  maxDailyCA: 100,         // Hard cap on daily CA earnings from encounters (flat)
};

// Calculate level-based AA cap
function getMaxDailyAA(level: number): number {
  const clampedLevel = Math.max(1, Math.min(level, 10)); // Levels 1-10
  return clampedLevel * DAILY_CAPS.aaPerLevel;
}

function getPlayerDailyEarnings(userId: string): DailyEarnings {
  const today = new Date().toISOString().split('T')[0];
  let earnings = playerDailyEarnings.get(userId);
  
  // Reset if it's a new day
  if (!earnings || earnings.date !== today) {
    earnings = {
      date: today,
      trapAttemptsToday: 0,
      treasureClaimsToday: 0,
      shrineOffersToday: 0,
      aaEarnedToday: 0,
      caEarnedToday: 0,
    };
    playerDailyEarnings.set(userId, earnings);
  }
  
  return earnings;
}

function checkDailyCap(userId: string, encounterType: 'trap' | 'treasure' | 'shrine'): { allowed: boolean; reason?: string } {
  const earnings = getPlayerDailyEarnings(userId);
  
  switch (encounterType) {
    case 'trap':
      if (earnings.trapAttemptsToday >= DAILY_CAPS.trapAttempts) {
        return { allowed: false, reason: `Daily trap attempt limit reached (${DAILY_CAPS.trapAttempts}/day)` };
      }
      break;
    case 'treasure':
      if (earnings.treasureClaimsToday >= DAILY_CAPS.treasureClaims) {
        return { allowed: false, reason: `Daily treasure limit reached (${DAILY_CAPS.treasureClaims}/day)` };
      }
      break;
    case 'shrine':
      if (earnings.shrineOffersToday >= DAILY_CAPS.shrineOffers) {
        return { allowed: false, reason: `Daily shrine limit reached (${DAILY_CAPS.shrineOffers}/day)` };
      }
      break;
  }
  
  return { allowed: true };
}

function recordEncounterReward(userId: string, encounterType: 'trap' | 'treasure' | 'shrine', aa: number, ca: number, playerLevel: number = 1): { aaGranted: number; caGranted: number; capped: boolean } {
  const earnings = getPlayerDailyEarnings(userId);
  
  // Track attempt
  switch (encounterType) {
    case 'trap':
      earnings.trapAttemptsToday++;
      break;
    case 'treasure':
      earnings.treasureClaimsToday++;
      break;
    case 'shrine':
      earnings.shrineOffersToday++;
      break;
  }
  
  // Calculate capped rewards - AA cap scales with level
  const maxDailyAA = getMaxDailyAA(playerLevel);
  const remainingAA = Math.max(0, maxDailyAA - earnings.aaEarnedToday);
  const remainingCA = Math.max(0, DAILY_CAPS.maxDailyCA - earnings.caEarnedToday);
  
  const aaGranted = Math.min(aa, remainingAA);
  const caGranted = Math.min(ca, remainingCA);
  
  earnings.aaEarnedToday += aaGranted;
  earnings.caEarnedToday += caGranted;
  
  const capped = aaGranted < aa || caGranted < ca;
  
  return { aaGranted, caGranted, capped };
}

export function registerEncounterRoutes(app: Express) {
  /**
   * GET /api/encounter/daily-status
   * Returns daily encounter caps and current usage
   * AA cap scales with character level (1000 per level)
   */
  app.get("/api/encounter/daily-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const earnings = getPlayerDailyEarnings(userId);
      
      // Fetch player level to calculate dynamic AA cap
      const currency = await storage.getPlayerCurrency(userId);
      const playerLevel = currency?.level ?? 1;
      const maxDailyAA = getMaxDailyAA(playerLevel);
      
      res.json({
        success: true,
        date: earnings.date,
        playerLevel,
        caps: {
          trapAttempts: DAILY_CAPS.trapAttempts,
          treasureClaims: DAILY_CAPS.treasureClaims,
          shrineOffers: DAILY_CAPS.shrineOffers,
          maxDailyAA,                         // Dynamic based on level
          maxDailyCA: DAILY_CAPS.maxDailyCA,  // Flat cap
          aaPerLevel: DAILY_CAPS.aaPerLevel,  // For display purposes
        },
        usage: {
          trapAttempts: earnings.trapAttemptsToday,
          treasureClaims: earnings.treasureClaimsToday,
          shrineOffers: earnings.shrineOffersToday,
          aaEarned: earnings.aaEarnedToday,
          caEarned: earnings.caEarnedToday,
        },
      });
    } catch (error) {
      console.error("Error getting daily status:", error);
      res.status(500).json({ message: "Failed to get daily status" });
    }
  });

  /**
   * POST /api/encounter/trap/attempt
   * ECONOMIC SECURITY: Now has daily caps and reduced rewards
   * Risk-reward balance: 40% fail (take damage), 60% succeed (reduced rewards)
   */
  app.post("/api/encounter/trap/attempt", isAuthenticated, validateBody(TrapAttemptSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken } = req.body;
      
      // Check daily cap BEFORE consuming token
      const capCheck = checkDailyCap(userId, 'trap');
      if (!capCheck.allowed) {
        logSecurityEvent(userId, 'TRAP_DAILY_CAP_REACHED', 'MEDIUM', {
          message: 'Player hit daily trap attempt cap',
          ip: req.ip,
        });
        return res.status(429).json({ 
          message: capCheck.reason,
          dailyLimitReached: true 
        });
      }
      
      const encounter = pendingEncounterManager.validateAndConsumeEncounter(
        encounterToken,
        userId,
        'trapped_chest'
      );
      
      if (!encounter) {
        return res.status(403).json({ message: "Invalid or expired encounter" });
      }

      const seedNum = hashStringToNumber(`${encounterToken}-${userId}-trap`);
      const rng = new SeededRNG(seedNum);
      const skillCheck = rng.next();
      
      // Fetch player level for dynamic AA cap
      const currency = await storage.getPlayerCurrency(userId);
      const playerLevel = currency?.level ?? 1;
      
      // ECONOMIC SECURITY: 40% success rate (down from 60%)
      // Risk-reward: Lower success rate justifies the reward
      if (skillCheck < 0.40) {
        // ECONOMIC SECURITY: Reduced base rewards
        const baseAA = rng.nextInt(20, 40); // Reduced from 40-80
        const baseCA = rng.nextInt(1, 3);   // Reduced from 3-6

        // Apply daily caps (AA cap scales with level)
        const { aaGranted, caGranted, capped } = recordEncounterReward(userId, 'trap', baseAA, baseCA, playerLevel);

        if (aaGranted > 0 || caGranted > 0) {
          await storage.ensurePlayerCurrency(userId, 0, 0);
          await storage.addCurrency(userId, aaGranted, caGranted);
        }
        
        const currencies = await storage.getPlayerCurrency(userId);

        logSecurityEvent(userId, 'TRAP_DISARM_SUCCESS', 'LOW', {
          encounterToken: encounterToken.substring(0, 10) + '...',
          zoneId: encounter.zoneId,
          arcaneAshReward: aaGranted,
          crystallineAnimusReward: caGranted,
          wasCapped: capped,
        });

        res.json({
          success: true,
          disarmed: true,
          arcaneAshReward: aaGranted,
          crystallineAnimusReward: caGranted,
          arcaneAsh: currencies?.arcaneAsh || 0,
          crystallineAnimus: currencies?.crystallineAnimus || 0,
          dailyCapped: capped,
        });
      } else {
        // Record attempt even on failure (for daily tracking)
        const earnings = getPlayerDailyEarnings(userId);
        earnings.trapAttemptsToday++;
        
        const damage = rng.nextInt(15, 25);

        logSecurityEvent(userId, 'TRAP_DISARM_FAILED', 'LOW', {
          encounterToken: encounterToken.substring(0, 10) + '...',
          zoneId: encounter.zoneId,
          damage,
        });

        res.json({
          success: true,
          disarmed: false,
          damage,
        });
      }
    } catch (error) {
      console.error("Error processing trap attempt:", error);
      res.status(500).json({ message: "Failed to process trap attempt" });
    }
  });

  /**
   * POST /api/encounter/treasure/claim
   * ECONOMIC SECURITY: Treasure no longer gives free AA/CA
   * Instead, it provides XP and exploration progress only
   * Currency rewards require defeating guardians (combat encounters)
   */
  app.post("/api/encounter/treasure/claim", isAuthenticated, validateBody(TreasureClaimSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken, combatVictory = false, combatSessionId } = req.body;
      
      // Check daily cap
      const capCheck = checkDailyCap(userId, 'treasure');
      if (!capCheck.allowed) {
        logSecurityEvent(userId, 'TREASURE_DAILY_CAP_REACHED', 'MEDIUM', {
          message: 'Player hit daily treasure cap',
          ip: req.ip,
        });
        return res.status(429).json({ 
          message: capCheck.reason,
          dailyLimitReached: true 
        });
      }
      
      const encounter = pendingEncounterManager.validateAndConsumeEncounter(
        encounterToken,
        userId,
        'treasure'
      );
      
      if (!encounter) {
        return res.status(403).json({ message: "Invalid or expired encounter" });
      }

      const tier = encounter.zoneId === 'fungal_hollows' ? 2 : 1;
      const seedNum = hashStringToNumber(`${encounterToken}-${userId}-treasure`);
      const rng = new SeededRNG(seedNum);
      
      // Fetch player level for dynamic AA cap
      const currency = await storage.getPlayerCurrency(userId);
      const playerLevel = currency?.level ?? 1;
      
      // ECONOMIC SECURITY: No more free currency from treasure encounters
      // Treasure now gives discovery/exploration rewards only
      // Currency requires combat victory (combatVictory flag from client after winning guardian fight)
      
      let aaReward = 0;
      let caReward = 0;
      let message = "You discovered a treasure cache!";
      
      if (combatVictory && combatSessionId) {
        // Only grant currency if combat was won (validated separately by combat system)
        // Reduced rewards compared to before
        const baseAA = 15 + (tier * 10); // Reduced from 20 + tier*15
        aaReward = rng.nextInt(baseAA, baseAA + 15);
        caReward = tier > 1 ? rng.nextInt(0, tier - 1) : 0; // Even lower CA
        
        // FIX: Only count toward daily cap when actually granting currency (AA cap scales with level)
        const { aaGranted, caGranted, capped } = recordEncounterReward(userId, 'treasure', aaReward, caReward, playerLevel);
        
        if (aaGranted > 0 || caGranted > 0) {
          await storage.ensurePlayerCurrency(userId, 0, 0);
          await storage.addCurrency(userId, aaGranted, caGranted);
        }
        
        aaReward = aaGranted;
        caReward = caGranted;
        message = "You defeated the guardian and claimed the treasure!";
        
        logSecurityEvent(userId, 'TREASURE_CLAIM_WITH_COMBAT', 'LOW', {
          encounterToken: encounterToken.substring(0, 10) + '...',
          zoneId: encounter.zoneId,
          tier,
          arcaneAshReward: aaGranted,
          crystallineAnimusReward: caGranted,
          combatSessionId: combatSessionId?.substring(0, 15) + '...',
          wasCapped: capped,
        });
      } else {
        // No combat victory - just discovery (no currency)
        // FIX: Do NOT count toward daily cap - only discovery, no reward consumed
        // The encounter token is consumed to prevent repeated discovery spam
        message = "You found a treasure cache, but it's guarded! Defeat the guardian to claim the contents.";
        
        logSecurityEvent(userId, 'TREASURE_DISCOVERED_NO_COMBAT', 'LOW', {
          encounterToken: encounterToken.substring(0, 10) + '...',
          zoneId: encounter.zoneId,
          tier,
          message: 'Treasure discovered but no combat victory - no currency awarded, daily cap not consumed',
        });
      }
      
      const currencies = await storage.getPlayerCurrency(userId);

      res.json({
        success: true,
        message,
        arcaneAshReward: aaReward,
        crystallineAnimusReward: caReward,
        arcaneAsh: currencies?.arcaneAsh || 0,
        crystallineAnimus: currencies?.crystallineAnimus || 0,
        requiresCombat: !combatVictory,
      });
    } catch (error) {
      console.error("Error claiming treasure:", error);
      res.status(500).json({ message: "Failed to claim treasure" });
    }
  });

  /**
   * POST /api/encounter/shrine/offer
   * ECONOMIC SECURITY: Added daily caps for shrine offers
   * Shrine already has risk-reward (costs 50 AA, 70% chance of nothing)
   */
  app.post("/api/encounter/shrine/offer", isAuthenticated, validateBody(ShrineOfferSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken, offerAmount } = req.body;
      
      // Check daily cap
      const capCheck = checkDailyCap(userId, 'shrine');
      if (!capCheck.allowed) {
        logSecurityEvent(userId, 'SHRINE_DAILY_CAP_REACHED', 'MEDIUM', {
          message: 'Player hit daily shrine cap',
          ip: req.ip,
        });
        return res.status(429).json({ 
          message: capCheck.reason,
          dailyLimitReached: true 
        });
      }
      
      const encounter = pendingEncounterManager.validateAndConsumeEncounter(
        encounterToken,
        userId,
        'shrine'
      );
      
      if (!encounter) {
        return res.status(403).json({ message: "Invalid or expired encounter" });
      }

      const offerCost = 50;
      if (offerAmount !== offerCost) {
        return res.status(400).json({ message: "Invalid offer amount" });
      }

      const currentCurrency = await storage.getPlayerCurrency(userId);
      if (!currentCurrency || currentCurrency.arcaneAsh < offerCost) {
        return res.status(400).json({ message: "Insufficient Arcane Ash" });
      }

      await storage.deductCurrency(userId, offerCost, 0);
      
      // Track the attempt
      const earnings = getPlayerDailyEarnings(userId);
      earnings.shrineOffersToday++;
      
      const seedNum = hashStringToNumber(`${encounterToken}-${userId}-shrine`);
      const rng = new SeededRNG(seedNum);
      const roll = rng.next();

      let result: any = { success: true, offered: true };

      if (roll < 0.70) {
        result.outcome = 'nothing';
        result.message = 'The shrine consumes your offering... Nothing happens.';
      } else if (roll < 0.85) {
        result.outcome = 'buff';
        result.buffType = 'damage';
        result.buffDuration = 300000;
        result.message = 'Dark energy flows through you! +20% damage for 5 minutes.';
      } else if (roll < 0.95) {
        result.outcome = 'buff';
        result.buffType = 'defense';
        result.buffDuration = 300000;
        result.message = 'Void shadows protect you! +2 armor for 5 minutes.';
      } else {
        // ECONOMIC SECURITY: Apply daily CA cap to shrine rewards
        // Pass player level for consistency (even though CA cap is flat, AA might be added later)
        const playerLevel = currentCurrency?.level ?? 1;
        const baseCA = rng.nextInt(3, 6); // Reduced from 5-10
        const { caGranted, capped } = recordEncounterReward(userId, 'shrine', 0, baseCA, playerLevel);
        
        if (caGranted > 0) {
          await storage.addCurrency(userId, 0, caGranted);
        }
        
        result.outcome = 'reward';
        result.crystallineAnimusReward = caGranted;
        result.message = `The shrine rewards your faith! +${caGranted} Crystalline Animus.`;
        result.dailyCapped = capped;
      }

      const updatedCurrency = await storage.getPlayerCurrency(userId);
      result.arcaneAsh = updatedCurrency?.arcaneAsh || 0;
      result.crystallineAnimus = updatedCurrency?.crystallineAnimus || 0;

      logSecurityEvent(userId, 'SHRINE_OFFER', 'LOW', {
        encounterToken: encounterToken.substring(0, 10) + '...',
        outcome: result.outcome,
      });

      res.json(result);
    } catch (error) {
      console.error("Error processing shrine offer:", error);
      res.status(500).json({ message: "Failed to process shrine offer" });
    }
  });

  app.post("/api/encounter/skip", isAuthenticated, validateBody(EncounterTokenSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken } = req.body;
      
      const encounter = pendingEncounterManager.validateAndConsumeEncounter(
        encounterToken,
        userId
      );
      
      if (!encounter) {
        return res.status(403).json({ message: "Invalid or expired encounter" });
      }

      logSecurityEvent(userId, 'ENCOUNTER_SKIPPED', 'LOW', {
        encounterToken: encounterToken.substring(0, 10) + '...',
        type: encounter.type,
      });

      res.json({ success: true, message: "Encounter skipped" });
    } catch (error) {
      console.error("Error skipping encounter:", error);
      res.status(500).json({ message: "Failed to skip encounter" });
    }
  });
}

function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
