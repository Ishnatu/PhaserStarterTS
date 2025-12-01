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
    [1, { successChance: 0.95, failureResult: 'no_change', destructionChance: 0, costAA: 100, costCA: 1 }],
    [2, { successChance: 0.85, failureResult: 'no_change', destructionChance: 0, costAA: 250, costCA: 2 }],
    [3, { successChance: 0.70, failureResult: 'downgrade', destructionChance: 0, costAA: 400, costCA: 4 }],
    [4, { successChance: 0.60, failureResult: 'downgrade', destructionChance: 0, costAA: 600, costCA: 8 }],
    [5, { successChance: 0.45, failureResult: 'downgrade', destructionChance: 0.10, costAA: 900, costCA: 16 }],
    [6, { successChance: 0.35, failureResult: 'downgrade', destructionChance: 0.15, costAA: 1300, costCA: 32 }],
    [7, { successChance: 0.25, failureResult: 'downgrade', destructionChance: 0.25, costAA: 2000, costCA: 64 }],
    [8, { successChance: 0.15, failureResult: 'downgrade', destructionChance: 0.35, costAA: 3000, costCA: 128 }],
    [9, { successChance: 0.10, failureResult: 'downgrade', destructionChance: 0.50, costAA: 5000, costCA: 256 }],
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

  /**
   * @deprecated DO NOT USE - Forging is server-authoritative only.
   * Use the /api/forge/attempt endpoint instead.
   * This method exists only for backward compatibility and will throw an error.
   */
  static attemptForging(_item: InventoryItem, _playerAA: number, _playerCA: number): ForgingResult {
    console.error('[SECURITY] Client-side attemptForging called - this is not allowed. Use server API.');
    throw new Error('Forging must be done via server API. Client-side forging is disabled for security.');
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

    // Repair costs (whole numbers only):
    // AA: 1 + (enhancement × 2) per durability point
    // CA: Base 1 + scaled by durability and enhancement
    const aaCostPerPoint = 1 + (enhancementLevel * 2);
    const totalAA = Math.ceil(missingDurability * aaCostPerPoint);
    
    // CA formula: 1 base + (durability × enhancement multiplier) / 50
    // +0 item, 50 missing = 2 CA | +9 item, 50 missing = 11 CA
    const totalCA = 1 + Math.floor((missingDurability * (1 + enhancementLevel)) / 50);

    return { 
      aa: totalAA, 
      ca: totalCA
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
