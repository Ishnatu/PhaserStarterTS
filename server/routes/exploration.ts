import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { logSecurityEvent } from "../security";
import { pendingEncounterManager, type EncounterType } from "../encounters/PendingEncounterManager";
import { SeededRNG } from "../utils/SeededRNG";
import { validatePosition, isValidZone } from "../security/zoneValidation";

function getEncounterDescription(type: EncounterType): string {
  switch (type) {
    case 'combat':
      return 'Something lurks in the shadows ahead...';
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
  // Max 2 standard monsters OR 1 boss monster
  const hasBoss = rng.next('boss_check') < 0.05;
  const enemyCount = hasBoss ? 1 : rng.nextInt(1, 2, 'enemy_count');
  
  return { tier, enemyCount, hasBoss };
}

export function registerExplorationRoutes(app: Express) {
  app.post("/api/exploration/move", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { zoneId, position, encounterRateMultiplier } = req.body;
      
      // [SECURITY] Basic input validation
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        return res.status(400).json({ message: "Invalid position" });
      }
      
      if (!zoneId || typeof zoneId !== 'string') {
        return res.status(400).json({ message: "Invalid zoneId" });
      }
      
      // [SECURITY] Validate zone bounds before any processing
      const positionValidation = validatePosition(userId, zoneId, position);
      if (!positionValidation.valid) {
        logSecurityEvent(userId, 'MOVE_POSITION_INVALID', 'HIGH', {
          message: 'Movement rejected - invalid position',
          position,
          reason: positionValidation.reason,
          ip: req.ip,
        });
        return res.status(400).json({ 
          message: "Invalid position coordinates",
          rejected: true,
        });
      }
      
      // Use clamped position if adjusted
      const validatedPosition = positionValidation.clampedPosition || position;
      
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
      
      // [SECURITY] Process movement with enhanced validation
      const result = pendingEncounterManager.processMovement(
        userId,
        zoneId,
        validatedPosition,
        multiplier
      );
      
      // [SECURITY] Handle rejected movements (teleport/speed hack detection)
      if (result.rejected) {
        logSecurityEvent(userId, 'MOVEMENT_BLOCKED', 'HIGH', {
          message: 'Movement blocked by security system',
          reason: result.rejectReason,
          position: validatedPosition,
          ip: req.ip,
        });
        return res.status(403).json({ 
          message: result.rejectReason || "Movement rejected",
          rejected: true,
          stepCounter: result.stateUpdate.stepCounter,
        });
      }
      
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
      const { zoneId, spawnPosition } = req.body;
      
      // [SECURITY] Load player's last known position from save data
      // This prevents first-move teleportation exploits
      const gameSave = await storage.getGameSaveByUserId(userId);
      let validatedSpawnPosition = { x: 800, y: 800 }; // Default spawn
      
      if (gameSave && gameSave.saveData) {
        const playerData = typeof gameSave.saveData === 'string' 
          ? JSON.parse(gameSave.saveData as string) 
          : gameSave.saveData;
        
        // Use last known position if available
        if (playerData.lastExplorationPosition) {
          validatedSpawnPosition = playerData.lastExplorationPosition;
        } else if (playerData.player?.position) {
          validatedSpawnPosition = playerData.player.position;
        }
      }
      
      // [SECURITY] If client provided a spawn position, validate it's near the valid spawn
      if (spawnPosition && typeof spawnPosition.x === 'number' && typeof spawnPosition.y === 'number') {
        const dx = spawnPosition.x - validatedSpawnPosition.x;
        const dy = spawnPosition.y - validatedSpawnPosition.y;
        const spawnDistance = Math.sqrt(dx * dx + dy * dy);
        
        // Allow some grace radius for spawn variation (e.g., zone entrances)
        const SPAWN_GRACE_RADIUS = 300;
        
        if (spawnDistance > SPAWN_GRACE_RADIUS) {
          logSecurityEvent(userId, 'SPAWN_POSITION_MANIPULATION', 'HIGH', {
            message: 'Client spawn position too far from valid spawn',
            clientSpawn: spawnPosition,
            validSpawn: validatedSpawnPosition,
            distance: spawnDistance,
          });
          // Use valid spawn position, not client's
        } else {
          validatedSpawnPosition = spawnPosition;
        }
      }
      
      // Reset exploration state with validated spawn position
      pendingEncounterManager.resetUserExplorationState(userId);
      pendingEncounterManager.clearUserEncounters(userId);
      
      // Initialize exploration state with validated position
      pendingEncounterManager.initializeExplorationWithPosition(userId, validatedSpawnPosition);
      
      res.json({
        success: true,
        message: "Exploration session started",
        zoneId: zoneId || 'roboka',
        spawnPosition: validatedSpawnPosition,
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
