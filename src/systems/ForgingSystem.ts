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
  shinyCreated?: boolean;
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

  static getShinyChance(targetLevel: number): number {
    if (targetLevel <= 0 || targetLevel > 9) return 0;
    if (targetLevel <= 4) return 0.005;
    if (targetLevel === 5) return 0.0075;
    if (targetLevel === 6) return 0.01;
    if (targetLevel === 7) return 0.0125;
    if (targetLevel === 8) return 0.015;
    if (targetLevel === 9) return 0.0175;
    return 0;
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
      // On success: increase enhancement level, maxDurability by 10, and restore to full
      item.enhancementLevel = targetLevel;
      item.maxDurability = (item.maxDurability || 100) + 10;
      item.durability = item.maxDurability;
      
      // Roll for shiny
      const shinyRoll = Math.random();
      const shinyChance = this.getShinyChance(targetLevel);
      const shinyCreated = shinyRoll < shinyChance;
      
      if (shinyCreated) {
        item.isShiny = true;
      }
      
      return {
        success: true,
        destroyed: false,
        downgraded: false,
        newLevel: targetLevel,
        message: shinyCreated 
          ? `★ SHINY! ★ Item enhanced to +${targetLevel} and glows with golden radiance!`
          : `SUCCESS! Item enhanced to +${targetLevel}!`,
        shinyCreated
      };
    }

    const destructionRoll = Math.random();
    if (destructionRoll < tier.destructionChance && !item.isShiny) {
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
      // On downgrade: reduce enhancement level and maxDurability by 10 (if it went down a level)
      if (newLevel < currentLevel) {
        item.enhancementLevel = newLevel;
        item.maxDurability = Math.max(100, (item.maxDurability || 100) - 10);
        item.durability = Math.min(item.durability || 100, item.maxDurability);
      }
      
      // Shiny items can downgrade but never be destroyed
      const message = item.isShiny 
        ? `FAILED! Shiny item downgraded to +${newLevel} (protected from destruction)`
        : `FAILED! Item downgraded to +${newLevel}`;
      
      return {
        success: false,
        destroyed: false,
        downgraded: true,
        newLevel: newLevel,
        message
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

    // New enhancement structure:
    // +1, +3: durability only
    // +2, +4, +6, +8: durability + 1 damage modifier
    // +5, +7, +9: durability + additional damage dice
    
    let bonusDice = 0;
    if (enhancementLevel >= 5) bonusDice++;
    if (enhancementLevel >= 7) bonusDice++;
    if (enhancementLevel >= 9) bonusDice++;

    // Calculate damage modifier bonus (only at even levels: +2, +4, +6, +8)
    let damageModifierBonus = 0;
    if (enhancementLevel >= 2) damageModifierBonus++;
    if (enhancementLevel >= 4) damageModifierBonus++;
    if (enhancementLevel >= 6) damageModifierBonus++;
    if (enhancementLevel >= 8) damageModifierBonus++;

    return {
      numDice: baseWeapon.damage.numDice + bonusDice,
      dieSize: baseWeapon.damage.dieSize,
      modifier: baseWeapon.damage.modifier + damageModifierBonus
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

  static getRepairCost(item: InventoryItem): { aa: number; ca: number } {
    const enhancementLevel = item.enhancementLevel || 0;
    const currentDurability = item.durability || 100;
    const maxDurability = item.maxDurability || 100;
    const missingDurability = maxDurability - currentDurability;

    if (missingDurability <= 0) {
      return { aa: 0, ca: 0 };
    }

    // Base repair cost: 1 AA per durability point
    // Enhanced items cost more: +10 AA per enhancement level
    const baseCostPerPoint = 1 + (enhancementLevel * 10);
    const totalAA = Math.ceil(missingDurability * baseCostPerPoint);
    
    // CA cost for enhanced items
    const totalCA = enhancementLevel > 0 ? enhancementLevel * 0.05 * missingDurability : 0;

    return { 
      aa: totalAA, 
      ca: Number(totalCA.toFixed(2))
    };
  }

  static repairItem(item: InventoryItem): void {
    item.durability = item.maxDurability || 100;
  }

  static needsRepair(item: InventoryItem): boolean {
    const currentDurability = item.durability || 100;
    const maxDurability = item.maxDurability || 100;
    return currentDurability < maxDurability;
  }

  static getDurabilityPercentage(item: InventoryItem): number {
    const currentDurability = item.durability || 100;
    const maxDurability = item.maxDurability || 100;
    return (currentDurability / maxDurability) * 100;
  }

  static getDurabilityColor(item: InventoryItem): string {
    const percentage = this.getDurabilityPercentage(item);
    if (percentage < 10) return '#ff0000'; // Red
    if (percentage < 30) return '#ffcc00'; // Yellow
    return '#ffffff'; // White
  }
}
