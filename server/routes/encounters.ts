import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { logSecurityEvent } from "../security";
import { SeededRNG } from "../utils/SeededRNG";
import { pendingEncounterManager } from "../encounters/PendingEncounterManager";

export function registerEncounterRoutes(app: Express) {
  app.post("/api/encounter/trap/attempt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken } = req.body;

      if (!encounterToken) {
        logSecurityEvent(userId, 'TRAP_NO_TOKEN', 'CRITICAL', {
          message: 'Trap attempt without encounterToken - EXPLOIT ATTEMPT',
          ip: req.ip,
        });
        return res.status(403).json({ message: "Encounter token required - encounter not registered" });
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
      
      if (skillCheck < 0.60) {
        const aa = rng.nextInt(40, 80);
        const ca = rng.nextInt(3, 6);

        await storage.ensurePlayerCurrency(userId, 0, 0);
        const currencies = await storage.addCurrency(userId, aa, ca);

        logSecurityEvent(userId, 'TRAP_DISARM_SUCCESS', 'LOW', {
          encounterToken: encounterToken.substring(0, 10) + '...',
          zoneId: encounter.zoneId,
          arcaneAshReward: aa,
          crystallineAnimusReward: ca,
        });

        res.json({
          success: true,
          disarmed: true,
          arcaneAshReward: aa,
          crystallineAnimusReward: ca,
          arcaneAsh: currencies.arcaneAsh,
          crystallineAnimus: currencies.crystallineAnimus,
        });
      } else {
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

  app.post("/api/encounter/treasure/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken } = req.body;

      if (!encounterToken) {
        logSecurityEvent(userId, 'TREASURE_NO_TOKEN', 'CRITICAL', {
          message: 'Treasure claim without encounterToken - EXPLOIT ATTEMPT',
          ip: req.ip,
        });
        return res.status(403).json({ message: "Encounter token required" });
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
      
      const baseAA = 20 + (tier * 15);
      const aa = rng.nextInt(baseAA, baseAA + 20);
      const ca = tier > 1 ? rng.nextInt(1, tier) : 0;

      await storage.ensurePlayerCurrency(userId, 0, 0);
      const currencies = await storage.addCurrency(userId, aa, ca);

      logSecurityEvent(userId, 'TREASURE_CLAIM_SUCCESS', 'LOW', {
        encounterToken: encounterToken.substring(0, 10) + '...',
        zoneId: encounter.zoneId,
        tier,
        arcaneAshReward: aa,
        crystallineAnimusReward: ca,
      });

      res.json({
        success: true,
        arcaneAshReward: aa,
        crystallineAnimusReward: ca,
        arcaneAsh: currencies.arcaneAsh,
        crystallineAnimus: currencies.crystallineAnimus,
      });
    } catch (error) {
      console.error("Error claiming treasure:", error);
      res.status(500).json({ message: "Failed to claim treasure" });
    }
  });

  app.post("/api/encounter/shrine/offer", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken, offerAmount } = req.body;

      if (!encounterToken) {
        logSecurityEvent(userId, 'SHRINE_NO_TOKEN', 'CRITICAL', {
          message: 'Shrine offer without encounterToken - EXPLOIT ATTEMPT',
          ip: req.ip,
        });
        return res.status(403).json({ message: "Encounter token required" });
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
        const caReward = rng.nextInt(5, 10);
        await storage.addCurrency(userId, 0, caReward);
        result.outcome = 'reward';
        result.crystallineAnimusReward = caReward;
        result.message = `The shrine rewards your faith! +${caReward} Crystalline Animus.`;
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

  app.post("/api/encounter/skip", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterToken } = req.body;

      if (!encounterToken) {
        return res.status(400).json({ message: "Encounter token required" });
      }
      
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
