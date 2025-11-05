import { StatusCondition, StatusConditionType, Enemy, PlayerData } from '../types/GameTypes';

export class ConditionManager {
  static applyCondition(
    target: Enemy | PlayerData,
    conditionType: StatusConditionType,
    duration: number,
    stacks: number = 1
  ): void {
    const existingCondition = target.statusConditions.find(c => c.type === conditionType);
    
    if (existingCondition) {
      if (conditionType === 'dependable') {
        existingCondition.duration = Math.max(existingCondition.duration, duration);
      } else {
        existingCondition.stacks += stacks;
        existingCondition.duration = Math.max(existingCondition.duration, duration);
      }
    } else {
      target.statusConditions.push({
        type: conditionType,
        stacks,
        duration,
      });
    }
  }

  static removeCondition(target: Enemy | PlayerData, conditionType: StatusConditionType): void {
    target.statusConditions = target.statusConditions.filter(c => c.type !== conditionType);
  }

  static hasCondition(target: Enemy | PlayerData, conditionType: StatusConditionType): boolean {
    return target.statusConditions.some(c => c.type === conditionType);
  }

  static getCondition(target: Enemy | PlayerData, conditionType: StatusConditionType): StatusCondition | undefined {
    return target.statusConditions.find(c => c.type === conditionType);
  }

  static clearAllConditions(target: Enemy | PlayerData): void {
    target.statusConditions = [];
  }

  static tickConditions(target: Enemy | PlayerData): { damage: number; messages: string[] } {
    const messages: string[] = [];
    let totalDamage = 0;

    const conditionsToRemove: StatusConditionType[] = [];

    for (const condition of target.statusConditions) {
      if (condition.duration > 0) {
        condition.duration--;
      }

      if (condition.type === 'bleeding') {
        const bleedDamage = condition.stacks * 2;
        totalDamage += bleedDamage;
        messages.push(`Bleeding: ${bleedDamage} damage (${condition.stacks} stack${condition.stacks > 1 ? 's' : ''})`);
      } else if (condition.type === 'poisoned') {
        const poisonDamage = condition.stacks * 3;
        totalDamage += poisonDamage;
        messages.push(`Poisoned: ${poisonDamage} damage (${condition.stacks} stack${condition.stacks > 1 ? 's' : ''})`);
      }

      if (condition.duration === 0 && condition.type !== 'dependable') {
        conditionsToRemove.push(condition.type);
      }
    }

    for (const conditionType of conditionsToRemove) {
      this.removeCondition(target, conditionType);
      messages.push(`${this.getConditionDisplayName(conditionType)} wore off`);
    }

    return { damage: totalDamage, messages };
  }

  static tickPoisonOnly(target: Enemy | PlayerData): { damage: number; messages: string[] } {
    const messages: string[] = [];
    let totalDamage = 0;

    const conditionsToRemove: StatusConditionType[] = [];

    for (const condition of target.statusConditions) {
      if (condition.type === 'poisoned') {
        const poisonDamage = condition.stacks * 3;
        totalDamage += poisonDamage;
        messages.push(`Poisoned: ${poisonDamage} damage (${condition.stacks} stack${condition.stacks > 1 ? 's' : ''})`);
        
        if (condition.duration > 0) {
          condition.duration--;
        }
        
        if (condition.duration === 0) {
          conditionsToRemove.push(condition.type);
        }
      }
    }

    for (const conditionType of conditionsToRemove) {
      this.removeCondition(target, conditionType);
      messages.push(`${this.getConditionDisplayName(conditionType)} wore off`);
    }

    return { damage: totalDamage, messages };
  }

  static tickBleedingOnly(target: Enemy | PlayerData): { damage: number; messages: string[] } {
    const messages: string[] = [];
    let totalDamage = 0;

    const conditionsToRemove: StatusConditionType[] = [];

    for (const condition of target.statusConditions) {
      if (condition.type === 'bleeding') {
        const bleedDamage = condition.stacks * 2;
        totalDamage += bleedDamage;
        messages.push(`Bleeding: ${bleedDamage} damage (${condition.stacks} stack${condition.stacks > 1 ? 's' : ''})`);
        
        if (condition.duration > 0) {
          condition.duration--;
        }
        
        if (condition.duration === 0) {
          conditionsToRemove.push(condition.type);
        }
      }
    }

    for (const conditionType of conditionsToRemove) {
      this.removeCondition(target, conditionType);
      messages.push(`${this.getConditionDisplayName(conditionType)} wore off`);
    }

    return { damage: totalDamage, messages };
  }

  static getConditionDisplayName(conditionType: StatusConditionType): string {
    const displayNames: Record<StatusConditionType, string> = {
      bleeding: 'Bleeding',
      stunned: 'Stunned',
      poisoned: 'Poisoned',
      dependable: 'Dependable',
      raise_evasion: 'Evasion Up',
      raise_defence: 'Defence Up',
      vampiric: 'Vampiric',
      decapitate: 'Decapitate',
    };
    return displayNames[conditionType] || conditionType;
  }

  static getConditionColor(conditionType: StatusConditionType): number {
    const colors: Record<StatusConditionType, number> = {
      bleeding: 0xff0000,
      stunned: 0x888888,
      poisoned: 0x00ff00,
      dependable: 0x4444ff,
      raise_evasion: 0xaaaaff,
      raise_defence: 0xffaa00,
      vampiric: 0xff00ff,
      decapitate: 0xff0000,
    };
    return colors[conditionType] || 0xffffff;
  }

  static isStunned(target: Enemy | PlayerData): boolean {
    return this.hasCondition(target, 'stunned');
  }

  static getDependableBonus(target: PlayerData): number {
    const dependable = this.getCondition(target, 'dependable');
    return dependable ? 5 : 0;
  }

  static getEvasionBonus(target: Enemy | PlayerData): number {
    let bonus = 0;
    const evasionConditions = target.statusConditions.filter(c => c.type === 'raise_evasion');
    for (const condition of evasionConditions) {
      bonus += condition.stacks * 3;
    }
    return bonus;
  }

  static getDamageReductionBonus(target: Enemy | PlayerData): number {
    let bonus = 0;
    const defenceConditions = target.statusConditions.filter(c => c.type === 'raise_defence');
    for (const condition of defenceConditions) {
      bonus += condition.stacks * 0.1;
    }
    return Math.min(bonus, 0.75);
  }

  static clearExpiredConditions(target: Enemy | PlayerData): void {
    target.statusConditions = target.statusConditions.filter(c => c.duration > 0 || c.type === 'dependable');
  }

  static getTotalStacks(target: Enemy | PlayerData, conditionType: StatusConditionType): number {
    const condition = this.getCondition(target, conditionType);
    return condition ? condition.stacks : 0;
  }

  static reduceStacks(target: Enemy | PlayerData, conditionType: StatusConditionType, amount: number): void {
    const condition = this.getCondition(target, conditionType);
    if (condition) {
      condition.stacks = Math.max(0, condition.stacks - amount);
      if (condition.stacks === 0) {
        this.removeCondition(target, conditionType);
      }
    }
  }
}
