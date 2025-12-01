import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { logSecurityEvent } from "../security";
import { SeededRNG } from "../utils/SeededRNG";
import { pendingEncounterManager } from "../encounters/PendingEncounterManager";
import { validateBody } from "../validation/middleware";
import { TrapAttemptSchema, TreasureClaimSchema, ShrineOfferSchema, EncounterTokenSchema } from "../validation/schemas";
import { db } from "../db";
import { playerDailyLimits } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * ECONOMIC SECURITY: Daily earning caps and tracking
 * NOW PERSISTED TO DATABASE - survives server restarts
 * Prevents multi-account farming and bot exploitation
 */

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

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Get or create player's daily limits from database
async function getPlayerDailyLimits(playerId: string): Promise<{
  trapAttempts: number;
  treasureClaims: number;
  shrineOffers: number;
  aaEarned: number;
  caEarned: number;
}> {
  const today = getTodayDate();
  
  const [existing] = await db
    .select()
    .from(playerDailyLimits)
    .where(and(
      eq(playerDailyLimits.playerId, playerId),
      eq(playerDailyLimits.date, today)
    ))
    .limit(1);
  
  if (existing) {
    return {
      trapAttempts: existing.trapAttempts,
      treasureClaims: existing.treasureClaims,
      shrineOffers: existing.shrineOffers,
      aaEarned: existing.aaEarned,
      caEarned: existing.caEarned,
    };
  }
  
  // Create new record for today
  await db.insert(playerDailyLimits).values({
    playerId,
    date: today,
    trapAttempts: 0,
    treasureClaims: 0,
    shrineOffers: 0,
    aaEarned: 0,
    caEarned: 0,
  }).onConflictDoNothing();
  
  return {
    trapAttempts: 0,
    treasureClaims: 0,
    shrineOffers: 0,
    aaEarned: 0,
    caEarned: 0,
  };
}

async function checkDailyCap(playerId: string, encounterType: 'trap' | 'treasure' | 'shrine'): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getPlayerDailyLimits(playerId);
  
  switch (encounterType) {
    case 'trap':
      if (limits.trapAttempts >= DAILY_CAPS.trapAttempts) {
        return { allowed: false, reason: `Daily trap attempt limit reached (${DAILY_CAPS.trapAttempts}/day)` };
      }
      break;
    case 'treasure':
      if (limits.treasureClaims >= DAILY_CAPS.treasureClaims) {
        return { allowed: false, reason: `Daily treasure limit reached (${DAILY_CAPS.treasureClaims}/day)` };
      }
      break;
    case 'shrine':
      if (limits.shrineOffers >= DAILY_CAPS.shrineOffers) {
        return { allowed: false, reason: `Daily shrine limit reached (${DAILY_CAPS.shrineOffers}/day)` };
      }
      break;
  }
  
  return { allowed: true };
}

async function recordEncounterReward(
  playerId: string, 
  encounterType: 'trap' | 'treasure' | 'shrine', 
  aa: number, 
  ca: number, 
  playerLevel: number = 1
): Promise<{ aaGranted: number; caGranted: number; capped: boolean }> {
  const today = getTodayDate();
  
  // Use transaction to atomically update limits
  return await db.transaction(async (tx) => {
    // Ensure record exists
    await tx.insert(playerDailyLimits).values({
      playerId,
      date: today,
      trapAttempts: 0,
      treasureClaims: 0,
      shrineOffers: 0,
      aaEarned: 0,
      caEarned: 0,
    }).onConflictDoNothing();
    
    // Get current with lock
    const [current] = await tx
      .select()
      .from(playerDailyLimits)
      .where(and(
        eq(playerDailyLimits.playerId, playerId),
        eq(playerDailyLimits.date, today)
      ))
      .limit(1)
      .for('update');
    
    if (!current) {
      throw new Error('Failed to get daily limits record');
    }
    
    // Calculate capped rewards
    const maxDailyAA = getMaxDailyAA(playerLevel);
    const remainingAA = Math.max(0, maxDailyAA - current.aaEarned);
    const remainingCA = Math.max(0, DAILY_CAPS.maxDailyCA - current.caEarned);
    
    const aaGranted = Math.min(aa, remainingAA);
    const caGranted = Math.min(ca, remainingCA);
    const capped = aaGranted < aa || caGranted < ca;
    
    // Build update object
    const updateFields: any = {
      updatedAt: new Date(),
    };
    
    // Increment encounter counter
    switch (encounterType) {
      case 'trap':
        updateFields.trapAttempts = sql`${playerDailyLimits.trapAttempts} + 1`;
        break;
      case 'treasure':
        updateFields.treasureClaims = sql`${playerDailyLimits.treasureClaims} + 1`;
        break;
      case 'shrine':
        updateFields.shrineOffers = sql`${playerDailyLimits.shrineOffers} + 1`;
        break;
    }
    
    // Add earned currency
    if (aaGranted > 0) {
      updateFields.aaEarned = sql`${playerDailyLimits.aaEarned} + ${aaGranted}`;
    }
    if (caGranted > 0) {
      updateFields.caEarned = sql`${playerDailyLimits.caEarned} + ${caGranted}`;
    }
    
    await tx
      .update(playerDailyLimits)
      .set(updateFields)
      .where(and(
        eq(playerDailyLimits.playerId, playerId),
        eq(playerDailyLimits.date, today)
      ));
    
    return { aaGranted, caGranted, capped };
  });
}

// Increment encounter counter only (for failed attempts that don't grant currency)
async function incrementEncounterCounter(playerId: string, encounterType: 'trap' | 'treasure' | 'shrine'): Promise<void> {
  const today = getTodayDate();
  
  // Ensure record exists
  await db.insert(playerDailyLimits).values({
    playerId,
    date: today,
    trapAttempts: 0,
    treasureClaims: 0,
    shrineOffers: 0,
    aaEarned: 0,
    caEarned: 0,
  }).onConflictDoNothing();
  
  const updateFields: any = { updatedAt: new Date() };
  
  switch (encounterType) {
    case 'trap':
      updateFields.trapAttempts = sql`${playerDailyLimits.trapAttempts} + 1`;
      break;
    case 'treasure':
      updateFields.treasureClaims = sql`${playerDailyLimits.treasureClaims} + 1`;
      break;
    case 'shrine':
      updateFields.shrineOffers = sql`${playerDailyLimits.shrineOffers} + 1`;
      break;
  }
  
  await db
    .update(playerDailyLimits)
    .set(updateFields)
    .where(and(
      eq(playerDailyLimits.playerId, playerId),
      eq(playerDailyLimits.date, today)
    ));
}

export function registerEncounterRoutes(app: Express) {
  /**
   * GET /api/encounter/daily-status
   * Returns daily encounter caps and current usage
   * AA cap scales with character level (1000 per level)
   * NOW PERSISTED TO DATABASE - survives server restarts
   */
  app.get("/api/encounter/daily-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limits = await getPlayerDailyLimits(userId);
      
      // Fetch player level to calculate dynamic AA cap
      const currency = await storage.getPlayerCurrency(userId);
      const playerLevel = currency?.level ?? 1;
      const maxDailyAA = getMaxDailyAA(playerLevel);
      
      res.json({
        success: true,
        date: getTodayDate(),
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
          trapAttempts: limits.trapAttempts,
          treasureClaims: limits.treasureClaims,
          shrineOffers: limits.shrineOffers,
          aaEarned: limits.aaEarned,
          caEarned: limits.caEarned,
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
   * PERSISTED TO DATABASE - survives server restarts
   */
  app.post("/api/encounter/trap/attempt", isAuthenticated, validateBody(TrapAttemptSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken } = req.body;
      
      // Check daily cap BEFORE consuming token (now async - reads from database)
      const capCheck = await checkDailyCap(userId, 'trap');
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

        // Apply daily caps (AA cap scales with level) - now persisted to DB
        const { aaGranted, caGranted, capped } = await recordEncounterReward(userId, 'trap', baseAA, baseCA, playerLevel);

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
        // Record attempt even on failure (for daily tracking) - now persisted to DB
        await incrementEncounterCounter(userId, 'trap');
        
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
   * PERSISTED TO DATABASE - survives server restarts
   */
  app.post("/api/encounter/treasure/claim", isAuthenticated, validateBody(TreasureClaimSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken, combatVictory = false, combatSessionId } = req.body;
      
      // Check daily cap (now async - reads from database)
      const capCheck = await checkDailyCap(userId, 'treasure');
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
        
        // Apply daily caps (AA cap scales with level) - now persisted to DB
        const { aaGranted, caGranted, capped } = await recordEncounterReward(userId, 'treasure', aaReward, caReward, playerLevel);
        
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
   * PERSISTED TO DATABASE - survives server restarts
   */
  app.post("/api/encounter/shrine/offer", isAuthenticated, validateBody(ShrineOfferSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken, offerAmount } = req.body;
      
      // Check daily cap (now async - reads from database)
      const capCheck = await checkDailyCap(userId, 'shrine');
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
      
      const seedNum = hashStringToNumber(`${encounterToken}-${userId}-shrine`);
      const rng = new SeededRNG(seedNum);
      const roll = rng.next();

      let result: any = { success: true, offered: true };

      if (roll < 0.70) {
        // No reward - just track the attempt in database
        await incrementEncounterCounter(userId, 'shrine');
        result.outcome = 'nothing';
        result.message = 'The shrine consumes your offering... Nothing happens.';
      } else if (roll < 0.85) {
        await incrementEncounterCounter(userId, 'shrine');
        result.outcome = 'buff';
        result.buffType = 'damage';
        result.buffDuration = 300000;
        result.message = 'Dark energy flows through you! +20% damage for 5 minutes.';
      } else if (roll < 0.95) {
        await incrementEncounterCounter(userId, 'shrine');
        result.outcome = 'buff';
        result.buffType = 'defense';
        result.buffDuration = 300000;
        result.message = 'Void shadows protect you! +2 armor for 5 minutes.';
      } else {
        // ECONOMIC SECURITY: Apply daily CA cap to shrine rewards - persisted to DB
        const playerLevel = currentCurrency?.level ?? 1;
        const baseCA = rng.nextInt(3, 6); // Reduced from 5-10
        const { caGranted, capped } = await recordEncounterReward(userId, 'shrine', 0, baseCA, playerLevel);
        
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
