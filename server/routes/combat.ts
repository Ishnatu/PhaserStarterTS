// Combat API routes - server-authoritative combat system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { CombatSystem } from "../systems/CombatSystem";
import { DiceRoller } from "../systems/DiceRoller";
import { EnemyFactory } from "../systems/EnemyFactory";
import { WeaponValidator } from "../systems/WeaponValidator";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
import { validateSavePayload, enforceServerAuthoritativeValues } from "../security";
import type { CombatState, Enemy, PlayerData, WeaponAttack } from "../../shared/types";

/**
 * Combat session with RNG state for deterministic replay
 */
interface CombatSession {
  userId: string; // Owner of this combat session (prevents hijacking)
  combatState: CombatState;
  rngSeed: number;
  rngCalls: number;
}

/**
 * Session-based combat state storage
 * In production, this should be Redis/database-backed
 */
const activeCombatSessions = new Map<string, CombatSession>();

/**
 * Persist player state when combat is abandoned (fled or disconnected)
 * This prevents stamina/HP exploitation by bailing on combat
 * 
 * Resources that persist on abandonment:
 * - health: Damage taken during combat
 * - stamina: Stamina spent on attacks
 * - inventory: Items consumed during combat
 * - statusConditions: Any conditions applied during combat
 * 
 * Resources NOT given on abandonment:
 * - No loot/rewards (didn't win)
 * - No XP (didn't complete combat)
 */
async function finalizeAbandonedCombat(session: CombatSession): Promise<boolean> {
  try {
    const userId = session.userId;
    const combatPlayer = session.combatState.player;
    
    // Load FULL current save to preserve all data (delve state, map progress, etc)
    const gameSave = await storage.getGameSaveByUserId(userId);
    if (!gameSave || !gameSave.saveData) {
      console.error(`[COMBAT ABANDON] Failed to load save for ${userId}`);
      return false;
    }
    
    // Work with the full save data structure
    const fullSaveData = gameSave.saveData as any;
    const savedPlayer = fullSaveData.player || fullSaveData as PlayerData;
    
    // Merge ONLY combat-relevant fields into the existing player data
    // This preserves all other save data (delve, map, currencies, etc)
    const updatedPlayer: PlayerData = {
      ...savedPlayer,
      health: combatPlayer.health,
      stamina: combatPlayer.stamina,
      inventory: combatPlayer.inventory,
      statusConditions: combatPlayer.statusConditions,
    };
    
    // Reconstruct the full save with updated player data
    // Preserve any other top-level fields (delve state, explored tiles, etc)
    const updatedSaveData = fullSaveData.player 
      ? { ...fullSaveData, player: updatedPlayer }
      : updatedPlayer;
    
    // Validate and sanitize the complete save payload
    const validated = validateSavePayload(
      fullSaveData.player ? updatedSaveData : { player: updatedPlayer }, 
      userId
    );
    
    if (!validated.valid || !validated.sanitizedData) {
      console.error(`[COMBAT ABANDON] Validation failed for ${userId}:`, validated.errors);
      return false;
    }
    
    // Enforce server-authoritative values (level, stats, etc)
    const enforced = await enforceServerAuthoritativeValues(userId, validated.sanitizedData);
    
    // Save the complete updated save data (preserving all non-combat fields)
    await storage.saveGame({
      userId,
      saveData: enforced,
    });
    
    console.log(`[COMBAT ABANDON] Saved abandoned combat state for ${userId} - HP: ${combatPlayer.health}, SP: ${combatPlayer.stamina}`);
    return true;
  } catch (error) {
    console.error('[COMBAT ABANDON] Error finalizing abandoned combat:', error);
    return false;
  }
}

export function registerCombatRoutes(app: Express) {
  /**
   * POST /api/combat/initiate
   * Starts a new combat encounter with server-rolled initiative
   * 
   * [SERVER-AUTHORITATIVE SECURITY FIX]
   * - Accepts only enemy names (strings), not full enemy objects
   * - Creates enemies server-side using EnemyFactory with authoritative stats
   * - Prevents client from spoofing enemy HP/damage
   * 
   * Request body: { enemyNames: string[], isWildEncounter: boolean }
   */
  app.post("/api/combat/initiate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { enemyNames, isWildEncounter } = req.body;

      // [SECURITY] Validate input - accept only enemy names, not full objects
      if (!enemyNames || !Array.isArray(enemyNames)) {
        return res.status(400).json({ message: "enemyNames array required" });
      }

      if (enemyNames.length === 0 || enemyNames.length > 5) {
        return res.status(400).json({ message: "Must have 1-5 enemies" });
      }

      // Validate all enemy names are strings
      if (!enemyNames.every((name: any) => typeof name === 'string')) {
        return res.status(400).json({ message: "All enemy names must be strings" });
      }

      // [SERVER AUTHORITATIVE] Load player data from storage, ignore client payload
      const gameSave = await storage.getGameSaveByUserId(userId);
      if (!gameSave || !gameSave.saveData) {
        return res.status(404).json({ message: "No save found for player" });
      }

      const player = gameSave.saveData as PlayerData;

      // [SERVER RNG] Create deterministic seed from save data (not Math.random!)
      const userHash = userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const seed = userHash + Date.now();
      
      const rng = new SeededRNG(seed);
      const enemyFactory = new EnemyFactory(rng);

      // [SERVER AUTHORITATIVE] Create enemies using server-side factory
      // This prevents client from spoofing enemy stats
      const enemies: Enemy[] = [];
      for (const enemyName of enemyNames) {
        const enemy = enemyFactory.createEnemyByName(enemyName);
        if (!enemy) {
          return res.status(400).json({ message: `Unknown enemy: ${enemyName}` });
        }
        enemies.push(enemy);
      }

      // Roll initiative and create combat state server-side
      const diceRoller = new DiceRoller(rng);
      const combatSystem = new CombatSystem(diceRoller);
      const combatState = combatSystem.initiateCombat(
        player, 
        enemies,
        isWildEncounter || false
      );

      // Store combat session with RNG state for deterministic replay
      const sessionId = `${userId}_${Date.now()}`;
      activeCombatSessions.set(sessionId, {
        userId: userId,
        combatState,
        rngSeed: seed,
        rngCalls: rng.getCallCount(),
      });

      res.json({
        success: true,
        sessionId,
        combatState,
      });
    } catch (error) {
      console.error("Error initiating combat:", error);
      res.status(500).json({ message: "Failed to initiate combat" });
    }
  });

  /**
   * POST /api/combat/action
   * Processes a player action (attack/item/run) server-side
   * 
   * [SERVER-AUTHORITATIVE SECURITY FIX]
   * - Accepts only attackName (string), not full attack objects
   * - Validates attack against player's equipped weapons server-side
   * - Prevents client from forging "999 damage, 0 stamina cost" attacks
   * 
   * Request body: { sessionId: string, action: { type: string, attackName?: string, targetId?: string } }
   */
  app.post("/api/combat/action", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId, action } = req.body;

      // Validate input
      if (!sessionId || !action) {
        return res.status(400).json({ message: "Session ID and action required" });
      }

      // Retrieve combat session
      const session = activeCombatSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Combat session not found or expired" });
      }

      // Prevent session hijacking
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      // Recreate combat system with stored seed for deterministic replay
      const rng = new SeededRNG(session.rngSeed);
      rng.fastForward(session.rngCalls); // Restore RNG state
      const diceRoller = new DiceRoller(rng);
      const combatSystem = new CombatSystem(diceRoller);

      // Process player turn start if this is the first action of the player's turn
      // This ticks player conditions (poison, bleed) at the proper time
      let currentState = session.combatState;
      if (currentState.currentTurn === 'player' && 
          currentState.actionsRemaining === currentState.maxActionsPerTurn &&
          !currentState.turnStartProcessed) {
        currentState = combatSystem.playerTurnStart(currentState);
        currentState.turnStartProcessed = true;
        session.combatState = currentState;
        
        // Check if player died from condition damage
        if (currentState.isComplete) {
          activeCombatSessions.delete(sessionId);
          return res.json({
            success: true,
            combatState: currentState,
            combatEnded: true,
            result: { message: "You succumbed to your conditions..." },
          });
        }
      }

      // Process action server-side
      let updatedState: CombatState;
      let actionResult: any = null;
      
      switch (action.type) {
        case 'attack': {
          // [SECURITY] Validate attack - accept only attackName, not full attack object
          if (!action.attackName || typeof action.attackName !== 'string') {
            return res.status(400).json({ message: "Attack requires attackName (string)" });
          }

          if (!action.targetId) {
            return res.status(400).json({ message: "Attack requires targetId" });
          }
          
          // [SECURITY FIX] Reload fresh player data from storage, don't trust mutable session state
          // This prevents exploits where session state was tampered with earlier
          const gameSave = await storage.getGameSaveByUserId(userId);
          if (!gameSave || !gameSave.saveData) {
            return res.status(500).json({ message: "Failed to load player data" });
          }
          const freshPlayer = gameSave.saveData as PlayerData;

          // [SERVER AUTHORITATIVE] Validate attack against fresh player equipment from storage
          // This prevents client from forging attacks with spoofed damage/costs
          const validatedAttack = WeaponValidator.validateAttack(
            action.attackName,
            freshPlayer
          );

          if (!validatedAttack) {
            return res.status(400).json({ 
              message: `Invalid attack: "${action.attackName}" not found in equipped weapons` 
            });
          }

          // Find target index from targetId
          const targetIndex = session.combatState.enemies.findIndex((e: Enemy) => e.id === action.targetId);
          if (targetIndex === -1) {
            return res.status(400).json({ message: "Target enemy not found" });
          }
          
          // Execute attack using authoritative attack data from server
          const { state, result } = combatSystem.playerAttack(
            session.combatState,
            targetIndex,
            validatedAttack
          );
          updatedState = state;
          actionResult = result;
          break;
        }

        case 'item':
          return res.status(400).json({ message: "Item usage not yet implemented" });

        case 'run': {
          // Attempt to flee from combat
          // Save current combat state (stamina/HP spent) before allowing escape
          await finalizeAbandonedCombat(session);
          
          // Clean up combat session
          activeCombatSessions.delete(sessionId);
          
          // Mark combat as fled (player didn't win, but escaped)
          const fledState: CombatState = {
            ...session.combatState,
            isComplete: true,
            playerVictory: false,
          };
          
          return res.json({
            success: true,
            combatState: fledState,
            combatEnded: true,
            fled: true,
            result: { message: "You fled from combat! Your stamina and health costs remain." },
          });
        }

        case 'end_turn': {
          // End player turn and process all enemy turns
          let state = combatSystem.endPlayerTurn(session.combatState);
          
          // Process all enemy turns (enemyTurn handles all enemies and transitions back to player)
          if (state.currentTurn === 'enemy' && !state.isComplete) {
            state = combatSystem.enemyTurn(state);
          }
          
          updatedState = state;
          actionResult = { success: true };
          break;
        }

        default:
          return res.status(400).json({ message: "Invalid action type" });
      }

      // Update session with new combat state and RNG call count
      session.combatState = updatedState;
      session.rngCalls = rng.getCallCount();
      activeCombatSessions.set(sessionId, session);

      // Check if combat ended
      const combatEnded = combatSystem.isCombatComplete(updatedState);

      if (combatEnded) {
        // Clean up session
        activeCombatSessions.delete(sessionId);
      }

      res.json({
        success: true,
        combatState: updatedState,
        combatEnded,
        result: actionResult,
      });
    } catch (error) {
      console.error("Error processing combat action:", error);
      res.status(500).json({ message: "Failed to process action" });
    }
  });

  /**
   * POST /api/combat/end-turn
   * Processes all enemy AI turns server-side
   */
  app.post("/api/combat/end-turn", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.body;

      // Validate input
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID required" });
      }

      // Retrieve combat session
      const session = activeCombatSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Combat session not found or expired" });
      }

      // Prevent session hijacking
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      // Recreate combat system with stored seed for deterministic replay
      const rng = new SeededRNG(session.rngSeed);
      rng.fastForward(session.rngCalls); // Restore RNG state
      const diceRoller = new DiceRoller(rng);
      const combatSystem = new CombatSystem(diceRoller);

      // Process all enemy turns (enemyTurn processes all enemies and transitions back to player)
      const updatedState = combatSystem.enemyTurn(session.combatState);

      // Update session with new combat state and RNG call count
      session.combatState = updatedState;
      session.rngCalls = rng.getCallCount();
      activeCombatSessions.set(sessionId, session);

      // Check if combat ended
      const combatEnded = combatSystem.isCombatComplete(updatedState);

      if (combatEnded) {
        // Clean up session
        activeCombatSessions.delete(sessionId);
      }

      res.json({
        success: true,
        combatState: updatedState,
        combatEnded,
      });
    } catch (error) {
      console.error("Error processing enemy turns:", error);
      res.status(500).json({ message: "Failed to process enemy turns" });
    }
  });

  /**
   * GET /api/combat/state/:sessionId
   * Retrieves current combat state for a session
   */
  app.get("/api/combat/state/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      const session = activeCombatSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Combat session not found" });
      }

      // Prevent session hijacking
      if (session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      res.json({
        success: true,
        combatState: session.combatState,
      });
    } catch (error) {
      console.error("Error retrieving combat state:", error);
      res.status(500).json({ message: "Failed to retrieve combat state" });
    }
  });

  /**
   * DELETE /api/combat/:sessionId
   * Ends/abandons a combat session
   * 
   * [ANTI-EXPLOIT] Saves player state before cleanup to prevent stamina exploitation
   * When combat is abandoned (disconnect, browser close, explicit abandon), 
   * the stamina/HP costs from combat are persisted.
   */
  app.delete("/api/combat/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      const session = activeCombatSessions.get(sessionId);
      if (session && session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      // Save combat state before abandonment to persist stamina/HP costs
      if (session) {
        await finalizeAbandonedCombat(session);
      }

      const existed = activeCombatSessions.delete(sessionId);

      res.json({
        success: true,
        existed,
        message: existed ? "Combat abandoned - stamina and health costs saved" : "Session not found",
      });
    } catch (error) {
      console.error("Error ending combat session:", error);
      res.status(500).json({ message: "Failed to end combat session" });
    }
  });
}
