// Server-side Enemy Factory - Authoritative enemy stats
import type { Enemy, DiceRoll, WeaponType } from '../../shared/types';
import type { SeededRNG } from '../utils/SeededRNG';

/**
 * Server-authoritative enemy factory
 * All Math.random() replaced with SeededRNG for determinism
 */
export class EnemyFactory {
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  /**
   * Random weapon type selection (server RNG)
   */
  private randomWeaponType(): WeaponType {
    const weaponTypes: WeaponType[] = ['dagger', 'shortsword', 'longsword', 'battleaxe', 'mace', 'warhammer', 'greatsword', 'greataxe', 'spear', 'rapier'];
    return weaponTypes[this.rng.nextInt(0, weaponTypes.length - 1, 'enemy weapon type')];
  }

  /**
   * T1 Boss loot categories (Greater Void Spawn, Aetherbear)
   */
  private getT1BossLootCategories() {
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

  /**
   * Create enemy by tier and boss flag
   */
  createEnemy(tier: number, isBoss: boolean = false): Enemy {
    if (tier === 1 && !isBoss) {
      const tier1Mobs = [
        this.createVoidSpawn.bind(this),
        this.createSkitterthid.bind(this),
        this.createHollowHusk.bind(this),
        this.createWailingWisp.bind(this),
        this.createCrawleyCrow.bind(this)
      ];
      const randomMob = tier1Mobs[this.rng.nextInt(0, tier1Mobs.length - 1, 'T1 mob selection')];
      return randomMob();
    } else if (tier === 1 && isBoss) {
      const tier1Bosses = [
        this.createGreaterVoidSpawn.bind(this),
        this.createAetherbear.bind(this)
      ];
      const randomBoss = tier1Bosses[this.rng.nextInt(0, tier1Bosses.length - 1, 'T1 boss selection')];
      return randomBoss();
    } else if (tier === 2 && !isBoss) {
      return this.createShadowBeast();
    } else if (tier === 2 && isBoss) {
      return this.createVoidStalker();
    } else if (tier === 3 && !isBoss) {
      return this.createCorruptedSentinel();
    } else if (tier === 3 && isBoss) {
      return this.createVoidHarbinger();
    } else if (tier === 4 && !isBoss) {
      return this.createAbyssalHunter();
    } else if (tier === 4 && isBoss) {
      return this.createEternalVoid();
    } else if (tier === 5 && !isBoss) {
      return this.createChaosWraith();
    } else if (tier === 5 && isBoss) {
      return this.createVoidEmperor();
    }

    return this.createVoidSpawn();
  }

  /**
   * [SERVER AUTHORITATIVE] Create enemy by name (for combat API)
   * This prevents client from spoofing enemy stats
   */
  createEnemyByName(enemyName: string): Enemy | null {
    const enemyMap: Record<string, () => Enemy> = {
      'Void Spawn': this.createVoidSpawn.bind(this),
      'Skitterthid': this.createSkitterthid.bind(this),
      'Hollow Husk': this.createHollowHusk.bind(this),
      'Wailing Wisp': this.createWailingWisp.bind(this),
      'Crawley Crow': this.createCrawleyCrow.bind(this),
      'Greater Void Spawn': this.createGreaterVoidSpawn.bind(this),
      'Aetherbear': this.createAetherbear.bind(this),
      'Shadow Beast': this.createShadowBeast.bind(this),
      'Void Stalker': this.createVoidStalker.bind(this),
      'Corrupted Sentinel': this.createCorruptedSentinel.bind(this),
      'Void Harbinger': this.createVoidHarbinger.bind(this),
      'Abyssal Hunter': this.createAbyssalHunter.bind(this),
      'Eternal Void': this.createEternalVoid.bind(this),
      'Chaos Wraith': this.createChaosWraith.bind(this),
      'Void Emperor': this.createVoidEmperor.bind(this),
    };

    const createFn = enemyMap[enemyName];
    if (!createFn) {
      return null;
    }

    return createFn();
  }

  /**
   * Generate deterministic enemy ID using seeded RNG only
   * [SECURITY FIX] Removed Date.now() for auditability/replay
   */
  private generateEnemyId(enemyName: string): string {
    const random = this.rng.nextInt(100000, 999999, `${enemyName} ID`);
    return `enemy_${enemyName}_${random}`;
  }

  // ==================== TIER 1 MOBS ====================

  private createVoidSpawn(): Enemy {
    return {
      id: this.generateEnemyId('Void Spawn'),
      name: 'Void Spawn',
      tier: 1,
      isBoss: false,
      health: 45,
      maxHealth: 45,
      evasion: 12,
      damageReduction: 0.05,
      attackBonus: 0,
      damage: { numDice: 1, dieSize: 4, modifier: 2 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createSkitterthid(): Enemy {
    return {
      id: this.generateEnemyId('Skitterthid'),
      name: 'Skitterthid',
      tier: 1,
      isBoss: false,
      health: 24,
      maxHealth: 24,
      evasion: 8,
      damageReduction: 0,
      attackBonus: 0,
      damage: { numDice: 1, dieSize: 6, modifier: 1 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createHollowHusk(): Enemy {
    return {
      id: this.generateEnemyId('Hollow Husk'),
      name: 'Hollow Husk',
      tier: 1,
      isBoss: false,
      health: 36,
      maxHealth: 36,
      evasion: 5,
      damageReduction: 0,
      attackBonus: 0,
      damage: { numDice: 1, dieSize: 6, modifier: 1 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createWailingWisp(): Enemy {
    return {
      id: this.generateEnemyId('Wailing Wisp'),
      name: 'Wailing Wisp',
      tier: 1,
      isBoss: false,
      health: 28,
      maxHealth: 28,
      evasion: 8,
      damageReduction: 0,
      attackBonus: 0,
      damage: { numDice: 1, dieSize: 6, modifier: 2 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createCrawleyCrow(): Enemy {
    return {
      id: this.generateEnemyId('Crawley Crow'),
      name: 'Crawley Crow',
      tier: 1,
      isBoss: false,
      health: 31,
      maxHealth: 31,
      evasion: 8,
      damageReduction: 0,
      attackBonus: 0,
      damage: { numDice: 1, dieSize: 6, modifier: 1 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  // ==================== TIER 1 BOSSES ====================

  private createGreaterVoidSpawn(): Enemy {
    return {
      id: this.generateEnemyId('Greater Void Spawn'),
      name: 'Greater Void Spawn',
      tier: 1,
      isBoss: true,
      health: 90,
      maxHealth: 90,
      evasion: 14,
      damageReduction: 0.10,
      attackBonus: 0,
      damage: { numDice: 2, dieSize: 6, modifier: 3 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
      chronostepUsesRemaining: 2,
      damageReceivedHistory: [],
    };
  }

  private createAetherbear(): Enemy {
    return {
      id: this.generateEnemyId('Aetherbear'),
      name: 'Aetherbear',
      tier: 1,
      isBoss: true,
      health: 68,
      maxHealth: 68,
      evasion: 8,
      damageReduction: 0,
      attackBonus: 0,
      damage: { numDice: 2, dieSize: 8, modifier: 3 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  // ==================== TIER 2 ====================

  private createShadowBeast(): Enemy {
    return {
      id: this.generateEnemyId('Shadow Beast'),
      name: 'Shadow Beast',
      tier: 2,
      isBoss: false,
      health: 65,
      maxHealth: 65,
      evasion: 15,
      damageReduction: 0.08,
      attackBonus: 0,
      damage: { numDice: 1, dieSize: 8, modifier: 3 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createVoidStalker(): Enemy {
    return {
      id: this.generateEnemyId('Void Stalker'),
      name: 'Void Stalker',
      tier: 2,
      isBoss: true,
      health: 130,
      maxHealth: 130,
      evasion: 16,
      damageReduction: 0.15,
      attackBonus: 0,
      damage: { numDice: 2, dieSize: 8, modifier: 4 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  // ==================== TIER 3 ====================

  private createCorruptedSentinel(): Enemy {
    return {
      id: this.generateEnemyId('Corrupted Sentinel'),
      name: 'Corrupted Sentinel',
      tier: 3,
      isBoss: false,
      health: 95,
      maxHealth: 95,
      evasion: 17,
      damageReduction: 0.20,
      attackBonus: 0,
      damage: { numDice: 2, dieSize: 6, modifier: 5 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createVoidHarbinger(): Enemy {
    return {
      id: this.generateEnemyId('Void Harbinger'),
      name: 'Void Harbinger',
      tier: 3,
      isBoss: true,
      health: 180,
      maxHealth: 180,
      evasion: 18,
      damageReduction: 0.25,
      attackBonus: 0,
      damage: { numDice: 3, dieSize: 8, modifier: 5 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  // ==================== TIER 4 ====================

  private createAbyssalHunter(): Enemy {
    return {
      id: this.generateEnemyId('Abyssal Hunter'),
      name: 'Abyssal Hunter',
      tier: 4,
      isBoss: false,
      health: 120,
      maxHealth: 120,
      evasion: 19,
      damageReduction: 0.22,
      attackBonus: 0,
      damage: { numDice: 2, dieSize: 10, modifier: 6 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createEternalVoid(): Enemy {
    return {
      id: this.generateEnemyId('Eternal Void'),
      name: 'Eternal Void',
      tier: 4,
      isBoss: true,
      health: 240,
      maxHealth: 240,
      evasion: 20,
      damageReduction: 0.30,
      attackBonus: 0,
      damage: { numDice: 3, dieSize: 10, modifier: 7 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  // ==================== TIER 5 ====================

  private createChaosWraith(): Enemy {
    return {
      id: this.generateEnemyId('Chaos Wraith'),
      name: 'Chaos Wraith',
      tier: 5,
      isBoss: false,
      health: 150,
      maxHealth: 150,
      evasion: 21,
      damageReduction: 0.28,
      attackBonus: 0,
      damage: { numDice: 3, dieSize: 8, modifier: 7 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private createVoidEmperor(): Enemy {
    return {
      id: this.generateEnemyId('Void Emperor'),
      name: 'Void Emperor',
      tier: 5,
      isBoss: true,
      health: 300,
      maxHealth: 300,
      evasion: 22,
      damageReduction: 0.35,
      attackBonus: 0,
      damage: { numDice: 4, dieSize: 10, modifier: 8 },
      weaponType: this.randomWeaponType(),
      statusConditions: [],
      backstabUsed: false,
    };
  }

  // ==================== WILD ENCOUNTER ====================

  createWildEnemy(): Enemy {
    const tier = this.rng.nextInt(1, 2, 'wild enemy tier');
    return this.createEnemy(tier, false);
  }

  // ==================== LOOT ROLLING ====================

  /**
   * Roll loot for an enemy
   * T1 bosses use category-based system, others use fixed loot tables
   */
  rollLoot(enemyName: string, tier: number, isBoss: boolean): Array<{ itemId: string; enhancementLevel?: number }> {
    const droppedItems: Array<{ itemId: string; enhancementLevel?: number }> = [];
    
    // T1 bosses use category-based loot
    if (tier === 1 && isBoss) {
      const categories = this.getT1BossLootCategories();
      
      for (const category of Object.values(categories)) {
        if (this.rng.next(`${enemyName} loot category`) < category.dropChance) {
          const randomItem = category.items[this.rng.nextInt(0, category.items.length - 1, `${enemyName} category item`)];
          droppedItems.push({ ...randomItem });
        }
      }
      
      return droppedItems;
    }
    
    // Standard loot table rolling for non-T1-boss enemies
    // Using tier-based loot chances
    const lootTable = this.getLootTableForTier(tier, isBoss);
    for (const lootEntry of lootTable) {
      if (this.rng.next(`${enemyName} loot roll`) < lootEntry.dropChance) {
        droppedItems.push({
          itemId: lootEntry.itemId,
          enhancementLevel: lootEntry.enhancementLevel || 0
        });
      }
    }

    return droppedItems;
  }

  /**
   * Get loot table for a tier
   */
  private getLootTableForTier(tier: number, isBoss: boolean): Array<{ itemId: string; dropChance: number; enhancementLevel?: number }> {
    if (tier === 1 && !isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.05 },
        { itemId: 'potion_stamina', dropChance: 0.05 }
      ];
    } else if (tier === 2 && !isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.35 },
        { itemId: 'potion_stamina', dropChance: 0.30 }
      ];
    } else if (tier === 2 && isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.60 },
        { itemId: 'potion_stamina', dropChance: 0.50 }
      ];
    } else if (tier === 3 && !isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.40 },
        { itemId: 'potion_stamina', dropChance: 0.35 }
      ];
    } else if (tier === 3 && isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.70 },
        { itemId: 'potion_stamina', dropChance: 0.60 }
      ];
    } else if (tier === 4 && !isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.45 },
        { itemId: 'potion_stamina', dropChance: 0.40 }
      ];
    } else if (tier === 4 && isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.80 },
        { itemId: 'potion_stamina', dropChance: 0.70 }
      ];
    } else if (tier === 5 && !isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.50 },
        { itemId: 'potion_stamina', dropChance: 0.45 }
      ];
    } else if (tier === 5 && isBoss) {
      return [
        { itemId: 'potion_health', dropChance: 0.90 },
        { itemId: 'potion_stamina', dropChance: 0.80 }
      ];
    }
    return [];
  }

  rollCurrencyReward(tier: number, isBoss: boolean): number {
    if (tier === 1) {
      if (isBoss) {
        return this.rng.nextInt(25, 80, 'T1 boss currency');
      } else {
        return this.rng.nextInt(15, 45, 'T1 mob currency');
      }
    }
    
    return 30 * tier;
  }
}
