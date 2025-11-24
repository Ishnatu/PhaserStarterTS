import { Enemy } from '../../shared/types';
import { SeededRNG } from '../utils/SeededRNG';

interface LootCategory {
  dropChance: number;
  items: Array<{ itemId: string; enhancementLevel: number }>;
}

export class LootEngine {
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }
  private getT1BossLootCategories(): Record<string, LootCategory> {
    return {
      potions: {
        dropChance: 0.15,
        items: [
          { itemId: 'potion_health', enhancementLevel: 0 },
          { itemId: 'potion_stamina', enhancementLevel: 0 },
        ]
      },
      baseGear: {
        dropChance: 0.05,
        items: [
          { itemId: 'dagger_basic', enhancementLevel: 0 },
          { itemId: 'shortsword_basic', enhancementLevel: 0 },
          { itemId: 'helmet_leather', enhancementLevel: 0 },
          { itemId: 'chest_leather', enhancementLevel: 0 },
          { itemId: 'legs_leather', enhancementLevel: 0 },
          { itemId: 'boots_leather', enhancementLevel: 0 },
          { itemId: 'shoulders_leather', enhancementLevel: 0 },
        ]
      },
      enhancedGearPlus1: {
        dropChance: 0.03,
        items: [
          { itemId: 'dagger_basic', enhancementLevel: 1 },
          { itemId: 'shortsword_basic', enhancementLevel: 1 },
          { itemId: 'helmet_leather', enhancementLevel: 1 },
          { itemId: 'chest_leather', enhancementLevel: 1 },
          { itemId: 'legs_leather', enhancementLevel: 1 },
          { itemId: 'boots_leather', enhancementLevel: 1 },
          { itemId: 'shoulders_leather', enhancementLevel: 1 },
        ]
      },
      enhancedGearPlus2: {
        dropChance: 0.01,
        items: [
          { itemId: 'dagger_basic', enhancementLevel: 2 },
          { itemId: 'shortsword_basic', enhancementLevel: 2 },
          { itemId: 'helmet_leather', enhancementLevel: 2 },
          { itemId: 'chest_leather', enhancementLevel: 2 },
          { itemId: 'legs_leather', enhancementLevel: 2 },
          { itemId: 'boots_leather', enhancementLevel: 2 },
          { itemId: 'shoulders_leather', enhancementLevel: 2 },
        ]
      },
      enhancedGearPlus3: {
        dropChance: 0.005,
        items: [
          { itemId: 'dagger_basic', enhancementLevel: 3 },
          { itemId: 'shortsword_basic', enhancementLevel: 3 },
          { itemId: 'helmet_leather', enhancementLevel: 3 },
          { itemId: 'chest_leather', enhancementLevel: 3 },
          { itemId: 'legs_leather', enhancementLevel: 3 },
          { itemId: 'boots_leather', enhancementLevel: 3 },
          { itemId: 'shoulders_leather', enhancementLevel: 3 },
        ]
      }
    };
  }

  rollLoot(enemyTier: number, isBoss: boolean, lootTable?: Array<{ itemId: string; dropChance: number; enhancementLevel?: number }>): Array<{ itemId: string; enhancementLevel?: number }> {
    const droppedItems: Array<{ itemId: string; enhancementLevel?: number }> = [];
    
    // [SERVER RNG] T1 bosses use category-based loot
    if (enemyTier === 1 && isBoss) {
      const categories = this.getT1BossLootCategories();
      
      // [SERVER RNG] Roll for each category
      for (const category of Object.values(categories)) {
        if (this.rng.next('T1 boss loot category') < category.dropChance) {
          // [SERVER RNG] Randomly select one item from the category and clone it to prevent mutation
          const randomItem = category.items[this.rng.nextInt(0, category.items.length - 1, 'T1 boss loot item')];
          droppedItems.push({ ...randomItem });
        }
      }
      
      return droppedItems;
    }
    
    // [SERVER RNG] Standard loot table rolling for all other enemies
    if (lootTable) {
      for (const lootEntry of lootTable) {
        if (this.rng.next(`loot drop ${lootEntry.itemId}`) < lootEntry.dropChance) {
          droppedItems.push({
            itemId: lootEntry.itemId,
            enhancementLevel: lootEntry.enhancementLevel || 0
          });
        }
      }
    }

    return droppedItems;
  }

  rollCurrencyReward(tier: number, isBoss: boolean): number {
    // [SERVER RNG] T1 enemies use specific ranges
    if (tier === 1) {
      if (isBoss) {
        // T1 bosses: 25-80 AA
        return this.rng.nextInt(25, 80, 'T1 boss currency');
      } else {
        // T1 mobs: 15-45 AA
        return this.rng.nextInt(15, 45, 'T1 mob currency');
      }
    }
    
    // T2-T5 enemies use formula: 30 × tier per enemy
    return 30 * tier;
  }

  rollExperienceReward(enemyTier: number, isBoss: boolean, enemyMaxHealth: number): number {
    // Experience calculation based on tier and health (deterministic, no RNG)
    // Base XP = tier × 10
    let baseXP = enemyTier * 10;
    
    // Boss multiplier
    if (isBoss) {
      baseXP *= 2;
    }
    
    // Health factor (enemies with more HP give slightly more XP)
    const healthBonus = Math.floor(enemyMaxHealth / 10);
    
    return baseXP + healthBonus;
  }
}
