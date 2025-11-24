// Combat API routes - server-authoritative combat system
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { CombatSystem } from "../systems/CombatSystem";
import { DiceRoller } from "../systems/DiceRoller";
import { EnemyFactory } from "../systems/EnemyFactory";
import { WeaponValidator } from "../systems/WeaponValidator";
import { SeededRNG } from "../utils/SeededRNG";
import { storage } from "../storage";
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

        case 'run':
          return res.status(400).json({ message: "Running not yet implemented" });

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
   */
  app.delete("/api/combat/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.params;

      const session = activeCombatSessions.get(sessionId);
      if (session && session.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized access to combat session" });
      }

      const existed = activeCombatSessions.delete(sessionId);

      res.json({
        success: true,
        existed,
      });
    } catch (error) {
      console.error("Error ending combat session:", error);
      res.status(500).json({ message: "Failed to end combat session" });
    }
  });
}
