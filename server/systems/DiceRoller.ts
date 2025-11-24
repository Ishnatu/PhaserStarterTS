import { DiceRoll } from '../../shared/types';
import { SeededRNG } from '../utils/SeededRNG';

export class DiceRoller {
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  rollDice(numDice: number, dieSize: number): number[] {
    const rolls: number[] = [];
    for (let i = 0; i < numDice; i++) {
      // [SERVER RNG] Dice roll
      rolls.push(this.rng.rollDie(dieSize, `rollDice ${numDice}d${dieSize}`));
    }
    return rolls;
  }

  rollDiceTotal(diceRoll: DiceRoll): { total: number; rolls: number[]; modifier: number } {
    const rolls = this.rollDice(diceRoll.numDice, diceRoll.dieSize);
    const rollTotal = rolls.reduce((sum, roll) => sum + roll, 0);
    const total = rollTotal + diceRoll.modifier;
    
    return { total, rolls, modifier: diceRoll.modifier };
  }

  rollD20(): number {
    // [SERVER RNG] D20 roll
    return this.rng.rollDie(20, 'rollD20');
  }

  rollAttack(attackBonus: number): { roll: number; d20: number; total: number; critical: boolean } {
    const d20 = this.rollD20();
    const total = d20 + attackBonus;
    const critical = d20 === 20;
    
    return { roll: d20, d20, total, critical };
  }

  rollCriticalDamage(diceRoll: DiceRoll): { total: number; maxDie: number; extraRoll: number; modifier: number } {
    const maxDie = diceRoll.numDice * diceRoll.dieSize;
    
    const extraRolls = this.rollDice(diceRoll.numDice, diceRoll.dieSize);
    const extraRoll = extraRolls.reduce((sum, roll) => sum + roll, 0);
    
    const total = maxDie + extraRoll + diceRoll.modifier;
    
    return { total, maxDie, extraRoll, modifier: diceRoll.modifier };
  }

  formatDiceRoll(diceRoll: DiceRoll): string {
    const modifier = diceRoll.modifier >= 0 ? `+${diceRoll.modifier}` : `${diceRoll.modifier}`;
    return `${diceRoll.numDice}d${diceRoll.dieSize}${modifier}`;
  }

  rollD4(): number {
    // [SERVER RNG] D4 roll
    return this.rng.rollDie(4, 'rollD4');
  }

  /**
   * Check if a percentage chance succeeds
   * @param chance - Percentage chance (0-100)
   * @param context - Context for audit trail
   * @returns true if roll succeeds
   */
  checkPercentage(chance: number, context: string): boolean {
    // [SERVER RNG] Percentage check
    return this.rng.next(context) * 100 < chance;
  }

  /**
   * Get a random integer in range [min, max]
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @param context - Context for audit trail
   */
  randomInt(min: number, max: number, context: string): number {
    // [SERVER RNG] Random integer
    return this.rng.nextInt(min, max, context);
  }
}
