import { InventoryItem, WeaponData, ArmorData } from '../types/GameTypes';
import { ItemDatabase } from '../config/ItemDatabase';

interface ForgingTier {
  successChance: number;
  failureResult: 'no_change' | 'downgrade';
  destructionChance: number;
  costAA: number;
  costCA: number;
}

export interface ForgingResult {
  success: boolean;
  destroyed: boolean;
  downgraded: boolean;
  newLevel: number;
  message: string;
}

export class ForgingSystem {
  private static forgingTiers: Map<number, ForgingTier> = new Map([
    [1, { successChance: 0.95, failureResult: 'no_change', destructionChance: 0, costAA: 100, costCA: 0.1 }],
    [2, { successChance: 0.85, failureResult: 'no_change', destructionChance: 0, costAA: 250, costCA: 0.2 }],
    [3, { successChance: 0.70, failureResult: 'downgrade', destructionChance: 0, costAA: 400, costCA: 0.3 }],
    [4, { successChance: 0.60, failureResult: 'downgrade', destructionChance: 0, costAA: 600, costCA: 0.5 }],
    [5, { successChance: 0.45, failureResult: 'downgrade', destructionChance: 0.10, costAA: 900, costCA: 1.0 }],
    [6, { successChance: 0.35, failureResult: 'downgrade', destructionChance: 0.15, costAA: 1300, costCA: 1.5 }],
    [7, { successChance: 0.25, failureResult: 'downgrade', destructionChance: 0.25, costAA: 2000, costCA: 2.5 }],
    [8, { successChance: 0.15, failureResult: 'downgrade', destructionChance: 0.35, costAA: 3000, costCA: 3.5 }],
    [9, { successChance: 0.10, failureResult: 'downgrade', destructionChance: 0.50, costAA: 5000, costCA: 5.0 }],
  ]);

  static canForgeItem(item: InventoryItem): boolean {
    const weapon = ItemDatabase.getWeapon(item.itemId);
    const armor = ItemDatabase.getArmor(item.itemId);
    return !!(weapon || armor);
  }

  static getMaxEnhancementLevel(): number {
    return 9;
  }

  static getForgingCost(targetLevel: number): { aa: number; ca: number } | null {
    const tier = this.forgingTiers.get(targetLevel);
    if (!tier) return null;
    return { aa: tier.costAA, ca: tier.costCA };
  }

  static attemptForging(item: InventoryItem, playerAA: number, playerCA: number): ForgingResult {
    const currentLevel = item.enhancementLevel || 0;
    const targetLevel = currentLevel + 1;

    if (targetLevel > 9) {
      return {
        success: false,
        destroyed: false,
        downgraded: false,
        newLevel: currentLevel,
        message: 'Item is already at maximum enhancement (+9)!'
      };
    }

    const tier = this.forgingTiers.get(targetLevel);
    if (!tier) {
      return {
        success: false,
        destroyed: false,
        downgraded: false,
        newLevel: currentLevel,
        message: 'Invalid forging tier!'
      };
    }

    if (playerAA < tier.costAA || playerCA < tier.costCA) {
      return {
        success: false,
        destroyed: false,
        downgraded: false,
        newLevel: currentLevel,
        message: `Insufficient funds! Need ${tier.costAA} AA and ${tier.costCA} CA`
      };
    }

    const successRoll = Math.random();
    
    if (successRoll < tier.successChance) {
      return {
        success: true,
        destroyed: false,
        downgraded: false,
        newLevel: targetLevel,
        message: `SUCCESS! Item enhanced to +${targetLevel}!`
      };
    }

    const destructionRoll = Math.random();
    if (destructionRoll < tier.destructionChance) {
      return {
        success: false,
        destroyed: true,
        downgraded: false,
        newLevel: 0,
        message: `DESTROYED! The item shattered during forging!`
      };
    }

    if (tier.failureResult === 'downgrade') {
      const newLevel = Math.max(0, currentLevel - 1);
      return {
        success: false,
        destroyed: false,
        downgraded: true,
        newLevel: newLevel,
        message: `FAILED! Item downgraded to +${newLevel}`
      };
    }

    return {
      success: false,
      destroyed: false,
      downgraded: false,
      newLevel: currentLevel,
      message: `FAILED! No change to item.`
    };
  }

  static calculateEnhancedDamage(baseWeapon: WeaponData, enhancementLevel: number): { numDice: number; dieSize: number; modifier: number } {
    if (enhancementLevel === 0) {
      return { ...baseWeapon.damage };
    }

    let bonusDice = 0;
    if (enhancementLevel >= 5) bonusDice++;
    if (enhancementLevel >= 7) bonusDice++;
    if (enhancementLevel >= 9) bonusDice++;

    return {
      numDice: baseWeapon.damage.numDice + bonusDice,
      dieSize: baseWeapon.damage.dieSize,
      modifier: baseWeapon.damage.modifier + enhancementLevel
    };
  }

  static getItemDisplayName(item: InventoryItem): string {
    const weapon = ItemDatabase.getWeapon(item.itemId);
    const armor = ItemDatabase.getArmor(item.itemId);
    const potion = ItemDatabase.getPotion(item.itemId);

    const baseName = weapon?.name || armor?.name || potion?.name || 'Unknown Item';
    const level = item.enhancementLevel || 0;

    if (level > 0 && (weapon || armor)) {
      return `${baseName} +${level}`;
    }

    return baseName;
  }
}
