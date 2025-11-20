import { Enemy, DiceRoll, WeaponType } from '../types/GameTypes';

export class EnemyFactory {
  private static randomWeaponType(): WeaponType {
    const weaponTypes: WeaponType[] = ['dagger', 'shortsword', 'longsword', 'battleaxe', 'mace', 'warhammer', 'greatsword', 'greataxe', 'spear', 'rapier'];
    return weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
  }

  static createEnemy(tier: number, isBoss: boolean = false): Enemy {
    if (tier === 1 && !isBoss) {
      return this.createVoidSpawn();
    } else if (tier === 1 && isBoss) {
      return this.createGreaterVoidSpawn();
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
      health: 45,
      maxHealth: 45,
      evasion: 12,
      damageReduction: 0.05,
      weaponDamage: { numDice: 1, dieSize: 4, modifier: 2 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.30 },
        { itemId: 'potion_stamina', dropChance: 0.25 }
      ],
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createGreaterVoidSpawn(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Greater Void Spawn',
      health: 90,
      maxHealth: 90,
      evasion: 14,
      damageReduction: 0.10,
      weaponDamage: { numDice: 2, dieSize: 6, modifier: 3 },
      weaponType: this.randomWeaponType(),
      lootTable: [
        { itemId: 'potion_health', dropChance: 0.50 },
        { itemId: 'potion_stamina', dropChance: 0.40 }
      ],
      statusConditions: [],
      backstabUsed: false,
      chronostepUsesRemaining: 2,
      damageReceivedHistory: [],
    };
  }

  private static createShadowBeast(): Enemy {
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: 'Shadow Beast',
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

  static rollLoot(enemy: Enemy): string[] {
    const droppedItems: string[] = [];
    
    for (const lootEntry of enemy.lootTable) {
      if (Math.random() < lootEntry.dropChance) {
        droppedItems.push(lootEntry.itemId);
      }
    }

    return droppedItems;
  }

  static getSpriteKey(enemyName: string): string | null {
    const spriteMap: Record<string, string> = {
      'Void Spawn': 'void-spawn',
      'Greater Void Spawn': 'greater-void-spawn',
      'Shadow Beast': 'shadow-beast'
    };

    return spriteMap[enemyName] || null;
  }
}
