import { Enemy, DiceRoll } from '../types/GameTypes';

export class EnemyFactory {
  static createEnemy(tier: number, isBoss: boolean = false): Enemy {
    const multiplier = isBoss ? 2.0 : 1.0;
    const baseHealth = 30 + (tier * 15);
    const health = Math.floor(baseHealth * multiplier);

    const baseEvasion = 10 + Math.floor(tier * 0.5);
    const damageReduction = tier >= 3 ? 0.1 : 0;

    const weaponDamage: DiceRoll = {
      numDice: 1,
      dieSize: 6 + Math.min(tier * 2, 6),
      modifier: 2 + tier,
    };

    const lootTable = this.generateLootTable(tier, isBoss);

    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: isBoss ? this.getBossName(tier) : this.getEnemyName(tier),
      health,
      maxHealth: health,
      evasion: baseEvasion,
      damageReduction,
      weaponDamage,
      lootTable,
    };
  }

  static createWildEnemy(): Enemy {
    const tier = Math.floor(Math.random() * 2) + 1;
    return this.createEnemy(tier, false);
  }

  private static getEnemyName(tier: number): string {
    const names = [
      'Void Spawn',
      'Shadow Beast',
      'Corrupted Warrior',
      'Eldritch Horror',
      'Voidtouched Abomination',
    ];
    return names[Math.min(tier - 1, names.length - 1)];
  }

  private static getBossName(tier: number): string {
    const names = [
      'Greater Void Spawn',
      'Shadow Lord',
      'Corrupted Champion',
      'Eldritch Nightmare',
      'Primordial Voidbeast',
    ];
    return names[Math.min(tier - 1, names.length - 1)];
  }

  private static generateLootTable(tier: number, isBoss: boolean): { itemId: string; dropChance: number }[] {
    const lootTable: { itemId: string; dropChance: number }[] = [];

    lootTable.push({ itemId: 'potion_health', dropChance: 0.3 });
    lootTable.push({ itemId: 'potion_stamina', dropChance: 0.25 });

    if (tier >= 2) {
      lootTable.push({ itemId: 'chest_leather', dropChance: 0.15 });
      lootTable.push({ itemId: 'helmet_leather', dropChance: 0.15 });
    }

    if (tier >= 3) {
      lootTable.push({ itemId: 'longsword_basic', dropChance: 0.2 });
      lootTable.push({ itemId: 'battleaxe_basic', dropChance: 0.15 });
    }

    if (tier >= 4) {
      lootTable.push({ itemId: 'chest_heavy', dropChance: 0.1 });
      lootTable.push({ itemId: 'greatsword_basic', dropChance: 0.1 });
    }

    if (isBoss) {
      lootTable.forEach(item => item.dropChance *= 1.5);
      lootTable.push({ itemId: 'warhammer_basic', dropChance: 0.25 });
    }

    return lootTable;
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
}
