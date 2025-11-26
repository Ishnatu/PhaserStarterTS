import { Enemy, DiceRoll, WeaponType } from '../types/GameTypes';

export class EnemyFactory {
  private static randomWeaponType(): WeaponType {
    const weaponTypes: WeaponType[] = ['dagger', 'shortsword', 'longsword', 'battleaxe', 'mace', 'warhammer', 'greatsword', 'greataxe', 'spear', 'rapier'];
    return weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
  }

  private static getT1BossLootCategories() {
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

  static createEnemy(tier: number, isBoss: boolean = false): Enemy {
    if (tier === 1 && !isBoss) {
      const tier1Mobs = [
        this.createVoidSpawn,
        this.createSkitterthid,
        this.createHollowHusk,
        this.createWailingWisp,
        this.createCrawleyCrow
      ];
      const randomMob = tier1Mobs[Math.floor(Math.random() * tier1Mobs.length)];
      return randomMob.call(this);
    } else if (tier === 1 && isBoss) {
      const tier1Bosses = [
        this.createGreaterVoidSpawn,
        this.createAetherbear
      ];
      const randomBoss = tier1Bosses[Math.floor(Math.random() * tier1Bosses.length)];
      return randomBoss.call(this);
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

  private static createVoidSpawn(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Void Spawn',
      tier: 1,
      isBoss: false,
      health: 45,
      maxHealth: 45,
      evasion: 12,
      damageReduction: 0.05,
      weaponDamage: { numDice: 1, dieSize: 4, modifier: 2 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.05 },
        { itemId: 'potion_stamina', dropChance: 0.05 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createSkitterthid(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Skitterthid',
      tier: 1,
      isBoss: false,
      health: 24,
      maxHealth: 24,
      evasion: 8,
      damageReduction: 0,
      weaponDamage: { numDice: 1, dieSize: 6, modifier: 1 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.05 },
        { itemId: 'potion_stamina', dropChance: 0.05 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createHollowHusk(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Hollow Husk',
      tier: 1,
      isBoss: false,
      health: 36,
      maxHealth: 36,
      evasion: 5,
      damageReduction: 0,
      weaponDamage: { numDice: 1, dieSize: 6, modifier: 1 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.05 },
        { itemId: 'potion_stamina', dropChance: 0.05 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createWailingWisp(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Wailing Wisp',
      tier: 1,
      isBoss: false,
      health: 28,
      maxHealth: 28,
      evasion: 8,
      damageReduction: 0,
      weaponDamage: { numDice: 1, dieSize: 6, modifier: 2 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.05 },
        { itemId: 'potion_stamina', dropChance: 0.05 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createCrawleyCrow(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Crawley Crow',
      tier: 1,
      isBoss: false,
      health: 31,
      maxHealth: 31,
      evasion: 8,
      damageReduction: 0,
      weaponDamage: { numDice: 1, dieSize: 6, modifier: 1 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.05 },
        { itemId: 'potion_stamina', dropChance: 0.05 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createGreaterVoidSpawn(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Greater Void Spawn',
      tier: 1,
      isBoss: true,
      health: 90,
      maxHealth: 90,
      evasion: 14,
      damageReduction: 0.10,
      weaponDamage: { numDice: 2, dieSize: 6, modifier: 3 },
      weaponType: this.randomWeaponType(),
      lootTable: [], // Uses category-based loot
      statusConditions: [],
      backstabUsed: false,
      chronostepUsesRemaining: 2,
      damageReceivedHistory: [],
    };
  }

  static createAetherbear(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Aetherbear',
      tier: 1,
      isBoss: true,
      health: 68,
      maxHealth: 68,
      evasion: 8,
      damageReduction: 0,
      weaponDamage: { numDice: 2, dieSize: 8, modifier: 3 },
      weaponType: this.randomWeaponType(),
      lootTable: [], // Uses category-based loot
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createShadowBeast(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Shadow Beast',
      tier: 2,
      isBoss: false,
      health: 65,
      maxHealth: 65,
      evasion: 15,
      damageReduction: 0.08,
      weaponDamage: { numDice: 1, dieSize: 8, modifier: 3 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.35 },
        { itemId: 'potion_stamina', dropChance: 0.30 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createVoidStalker(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Void Stalker',
      tier: 2,
      isBoss: true,
      health: 130,
      maxHealth: 130,
      evasion: 16,
      damageReduction: 0.15,
      weaponDamage: { numDice: 2, dieSize: 8, modifier: 4 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.60 },
        { itemId: 'potion_stamina', dropChance: 0.50 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createCorruptedSentinel(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Corrupted Sentinel',
      tier: 3,
      isBoss: false,
      health: 95,
      maxHealth: 95,
      evasion: 17,
      damageReduction: 0.20,
      weaponDamage: { numDice: 2, dieSize: 6, modifier: 5 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.40 },
        { itemId: 'potion_stamina', dropChance: 0.35 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createVoidHarbinger(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Void Harbinger',
      tier: 3,
      isBoss: true,
      health: 180,
      maxHealth: 180,
      evasion: 18,
      damageReduction: 0.25,
      weaponDamage: { numDice: 3, dieSize: 8, modifier: 5 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.70 },
        { itemId: 'potion_stamina', dropChance: 0.60 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createAbyssalHunter(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Abyssal Hunter',
      tier: 4,
      isBoss: false,
      health: 120,
      maxHealth: 120,
      evasion: 19,
      damageReduction: 0.22,
      weaponDamage: { numDice: 2, dieSize: 10, modifier: 6 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.45 },
        { itemId: 'potion_stamina', dropChance: 0.40 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createEternalVoid(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Eternal Void',
      tier: 4,
      isBoss: true,
      health: 240,
      maxHealth: 240,
      evasion: 20,
      damageReduction: 0.30,
      weaponDamage: { numDice: 3, dieSize: 10, modifier: 7 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.80 },
        { itemId: 'potion_stamina', dropChance: 0.70 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createChaosWraith(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Chaos Wraith',
      tier: 5,
      isBoss: false,
      health: 150,
      maxHealth: 150,
      evasion: 21,
      damageReduction: 0.28,
      weaponDamage: { numDice: 3, dieSize: 8, modifier: 7 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.50 },
        { itemId: 'potion_stamina', dropChance: 0.45 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createVoidEmperor(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Void Emperor',
      tier: 5,
      isBoss: true,
      health: 300,
      maxHealth: 300,
      evasion: 22,
      damageReduction: 0.35,
      weaponDamage: { numDice: 4, dieSize: 10, modifier: 8 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.90 },
        { itemId: 'potion_stamina', dropChance: 0.80 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  static createWildEnemy(): Enemy {
    const tier = Math.floor(Math.random() * 2) + 1;
    return this.createEnemy(tier, false);
  }

  static rollLoot(enemy: Enemy): Array<{ itemId: string; enhancementLevel?: number }> {
    const droppedItems: Array<{ itemId: string; enhancementLevel?: number }> = [];
    
    // T1 bosses use category-based loot (metadata-based detection, no hardcoded names)
    if (enemy.tier === 1 && enemy.isBoss) {
      const categories = this.getT1BossLootCategories();
      
      // Roll for each category
      for (const category of Object.values(categories)) {
        if (Math.random() < category.dropChance) {
          // Randomly select one item from the category and clone it to prevent mutation
          const randomItem = category.items[Math.floor(Math.random() * category.items.length)];
          droppedItems.push({ ...randomItem });
        }
      }
      
      return droppedItems;
    }
    
    // Standard loot table rolling for all other enemies
    for (const lootEntry of enemy.lootTable) {
      if (Math.random() < lootEntry.dropChance) {
        droppedItems.push({
          itemId: lootEntry.itemId,
          enhancementLevel: lootEntry.enhancementLevel || 0  // Default to 0 if not specified
        });
      }
    }

    return droppedItems;
  }

  static rollCurrencyReward(tier: number, isBoss: boolean): number {
    // T1 enemies use specific ranges
    if (tier === 1) {
      if (isBoss) {
        // T1 bosses: 25-80 AA
        return Math.floor(Math.random() * (80 - 25 + 1)) + 25;
      } else {
        // T1 mobs: 15-45 AA
        return Math.floor(Math.random() * (45 - 15 + 1)) + 15;
      }
    }
    
    // T2-T5 enemies use formula: 30 × tier per enemy
    return 30 * tier;
  }

  static getSpriteKey(enemyName: string): string | null {
    const spriteMap: Record<string, string> = {
      'Void Spawn': 'void-spawn',
      'Greater Void Spawn': 'greater-void-spawn',
      'Shadow Beast': 'shadow-beast',
      'Skitterthid': 'skitterthid',
      'Aetherbear': 'aetherbear',
      'Hollow Husk': 'hollow-husk',
      'Crawley Crow': 'crawley-crow',
      'Wailing Wisp': 'wailing-wisp'
    };

    return spriteMap[enemyName] || null;
  }

  static isBossEnemy(enemyName: string): boolean {
    const bosses = ['Greater Void Spawn', 'Aetherbear'];
    return bosses.includes(enemyName);
  }
}
