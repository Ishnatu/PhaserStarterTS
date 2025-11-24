import { CombatState, PlayerData, Enemy, StatusCondition } from '../../shared/types';

/**
 * Deep clone utilities for server-side state management
 * Ensures immutability and prevents state mutation leaks
 */

export class DeepClone {
  /**
   * Deep clone a combat state to prevent mutation of original state
   */
  static combatState(state: CombatState): CombatState {
    return {
      player: this.playerData(state.player),
      enemies: state.enemies.map(e => this.enemy(e)),
      currentTurn: state.currentTurn,
      currentEnemyIndex: state.currentEnemyIndex,
      combatLog: [...state.combatLog],
      isComplete: state.isComplete,
      playerVictory: state.playerVictory,
      isWildEncounter: state.isWildEncounter,
      actionsRemaining: state.actionsRemaining,
      maxActionsPerTurn: state.maxActionsPerTurn,
      currentRound: state.currentRound,
    };
  }

  /**
   * Deep clone player data
   * Null-safe cloning of all optional nested structures
   */
  static playerData(player: PlayerData): PlayerData {
    return {
      ...player,
      statusConditions: player.statusConditions ? player.statusConditions.map(c => ({ ...c })) : [],
      inventory: player.inventory ? player.inventory.map(item => ({ ...item })) : [],
      footlocker: player.footlocker ? player.footlocker.map(item => ({ ...item })) : [],
      equipment: {
        mainHand: player.equipment?.mainHand ? { ...player.equipment.mainHand } : undefined,
        offHand: player.equipment?.offHand ? { ...player.equipment.offHand } : undefined,
        helmet: player.equipment?.helmet ? { ...player.equipment.helmet } : undefined,
        chest: player.equipment?.chest ? { ...player.equipment.chest } : undefined,
        legs: player.equipment?.legs ? { ...player.equipment.legs } : undefined,
        boots: player.equipment?.boots ? { ...player.equipment.boots } : undefined,
        shoulders: player.equipment?.shoulders ? { ...player.equipment.shoulders } : undefined,
        cape: player.equipment?.cape ? { ...player.equipment.cape } : undefined,
      },
      stats: player.stats ? { ...player.stats } : {
        baseEvasion: 0,
        calculatedEvasion: 0,
        damageReduction: 0,
        attackBonus: 0,
        damageBonus: 0,
      },
      buffs: player.buffs ? player.buffs.map(b => ({ ...b })) : undefined,
    };
  }

  /**
   * Deep clone enemy
   * Null-safe cloning of all optional nested structures
   */
  static enemy(enemy: Enemy): Enemy {
    return {
      ...enemy,
      statusConditions: enemy.statusConditions ? enemy.statusConditions.map(c => ({ ...c })) : [],
      damage: { ...enemy.damage },
      damageReceivedHistory: enemy.damageReceivedHistory ? [...enemy.damageReceivedHistory] : undefined,
    };
  }
}
