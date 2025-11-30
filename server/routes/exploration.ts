import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { logSecurityEvent } from "../security";
import { pendingEncounterManager, type EncounterType } from "../encounters/PendingEncounterManager";
import { SeededRNG } from "../utils/SeededRNG";

function getEncounterDescription(type: EncounterType): string {
  switch (type) {
    case 'combat':
      return 'Something lurks in the shadows ahead...';
    case 'treasure':
      return 'You notice a glinting object half-buried in the dirt.';
    case 'shrine':
      return 'An ancient shrine emanates corrupted energy...';
    case 'corrupted_void_portal':
      return 'A rift in reality tears open before you!';
    case 'trapped_chest':
      return 'A suspicious chest sits in an alcove. The lock looks intricate...';
    case 'tombstone':
      return 'You discover the remains of a fallen adventurer...';
    case 'wandering_merchant':
      return 'A mysterious merchant appears from the shadows...';
    default:
      return 'Something happens...';
  }
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

function generateCombatMetadata(zoneId: string, encounterToken: string): { tier: number; enemyCount: number; hasBoss: boolean } {
  const seedNum = hashStringToNumber(encounterToken);
  const rng = new SeededRNG(seedNum);
  
  const tier = zoneId === 'fungal_hollows' ? 2 : 1;
  const enemyCount = rng.nextInt(1, 3, 'enemy_count');
  const hasBoss = rng.next('boss_check') < 0.05;
  
  return { tier, enemyCount, hasBoss };
}

export function registerExplorationRoutes(app: Express) {
  app.post("/api/exploration/move", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { zoneId, position, encounterRateMultiplier } = req.body;
      
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        return res.status(400).json({ message: "Invalid position" });
      }
      
      if (!zoneId || typeof zoneId !== 'string') {
        return res.status(400).json({ message: "Invalid zoneId" });
      }
      
      const gameSave = await storage.getGameSaveByUserId(userId);
      if (!gameSave) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      const playerData = typeof gameSave.saveData === 'string' ? JSON.parse(gameSave.saveData as string) : gameSave.saveData;
      const discoveredZones = (playerData as any)?.discoveredZones || ['roboka'];
      if (!discoveredZones.includes(zoneId)) {
        logSecurityEvent(userId, 'INVALID_ZONE_ACCESS', 'HIGH', {
          message: 'Attempted to explore undiscovered zone',
          attemptedZone: zoneId,
          discoveredZones,
        });
        return res.status(403).json({ message: "Zone not discovered" });
      }
      
      const multiplier = typeof encounterRateMultiplier === 'number' 
        ? Math.max(0.1, Math.min(3.0, encounterRateMultiplier))
        : 1.0;
      
      const result = pendingEncounterManager.processMovement(
        userId,
        zoneId,
        position,
        multiplier
      );
      
      if (result.encounter) {
        const encounterData: any = {
          token: result.encounter.token,
          type: result.encounter.type,
          description: getEncounterDescription(result.encounter.type),
        };
        
        if (result.encounter.type === 'combat') {
          const combatMeta = generateCombatMetadata(zoneId, result.encounter.token);
          encounterData.combatMetadata = combatMeta;
        }
        
        res.json({
          encounter: encounterData,
          stepCounter: result.stateUpdate.stepCounter,
        });
      } else {
        res.json({
          encounter: null,
          stepCounter: result.stateUpdate.stepCounter,
        });
      }
    } catch (error) {
      console.error("Error processing movement:", error);
      res.status(500).json({ message: "Failed to process movement" });
    }
  });
  
  app.post("/api/exploration/start", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { zoneId } = req.body;
      
      pendingEncounterManager.resetUserExplorationState(userId);
      pendingEncounterManager.clearUserEncounters(userId);
      
      res.json({
        success: true,
        message: "Exploration session started",
        zoneId: zoneId || 'roboka',
      });
    } catch (error) {
      console.error("Error starting exploration:", error);
      res.status(500).json({ message: "Failed to start exploration" });
    }
  });
  
  app.post("/api/exploration/end", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      pendingEncounterManager.clearUserEncounters(userId);
      pendingEncounterManager.resetUserExplorationState(userId);
      
      res.json({
        success: true,
        message: "Exploration session ended",
      });
    } catch (error) {
      console.error("Error ending exploration:", error);
      res.status(500).json({ message: "Failed to end exploration" });
    }
  });
  
  app.get("/api/exploration/stats", isAuthenticated, async (req: any, res) => {
    try {
      const stats = pendingEncounterManager.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting exploration stats:", error);
      res.status(500).json({ message: "Failed to get stats" });
    }
  });
}
