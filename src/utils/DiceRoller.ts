import { DiceRoll } from '../types/GameTypes';

/**
 * CLIENT-SIDE DICE ROLLER
 * 
 * SECURITY NOTE: This class is for VISUAL DISPLAY ONLY.
 * All authoritative dice rolls happen on the server via SeededRNG.
 * These client-side rolls are used for:
 * - UI predictions while waiting for server response
 * - Visual dice animations
 * - Non-authoritative display purposes
 * 
 * Combat outcomes are ALWAYS determined by server-side rolls.
 * Do NOT trust these values for game logic.
 */
export class DiceRoller {
  static rollDice(numDice: number, dieSize: number): number[] {
    const rolls: number[] = [];
    for (let i = 0; i < numDice; i++) {
      rolls.push(Math.floor(Math.random() * dieSize) + 1);
    }
    return rolls;
  }

  static rollDiceTotal(diceRoll: DiceRoll): { total: number; rolls: number[]; modifier: number } {
    const rolls = this.rollDice(diceRoll.numDice, diceRoll.dieSize);
    const rollTotal = rolls.reduce((sum, roll) => sum + roll, 0);
    const total = rollTotal + diceRoll.modifier;
    
    return { total, rolls, modifier: diceRoll.modifier };
  }

  static rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
  }

  static rollAttack(attackBonus: number): { roll: number; d20: number; total: number; critical: boolean } {
    const d20 = this.rollD20();
    const total = d20 + attackBonus;
    const critical = d20 === 20;
    
    return { roll: d20, d20, total, critical };
  }

  static rollCriticalDamage(diceRoll: DiceRoll): { total: number; maxDie: number; extraRoll: number; modifier: number } {
    const maxDie = diceRoll.numDice * diceRoll.dieSize;
    
    const extraRolls = this.rollDice(diceRoll.numDice, diceRoll.dieSize);
    const extraRoll = extraRolls.reduce((sum, roll) => sum + roll, 0);
    
    const total = maxDie + extraRoll + diceRoll.modifier;
    
    return { total, maxDie, extraRoll, modifier: diceRoll.modifier };
  }

  static formatDiceRoll(diceRoll: DiceRoll): string {
    const modifier = diceRoll.modifier >= 0 ? `+${diceRoll.modifier}` : `${diceRoll.modifier}`;
    return `${diceRoll.numDice}d${diceRoll.dieSize}${modifier}`;
  }

  static rollD4(): number {
    return Math.floor(Math.random() * 4) + 1;
  }
}
