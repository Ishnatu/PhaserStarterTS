import { Enemy, DiceRoll, WeaponType } from '../types/GameTypes';
import { CsvParser } from '../utils/CsvParser';

interface EnemyData {
  name: string;
  tier: number;
  isBoss: boolean;
  health: number;
  evasion: number;
  damageReduction: number;
  weaponDamageDice: number;
  weaponDamageDieSize: number;
  weaponDamageModifier: number;
  spritePath: string;
  hasSprite: boolean;
  lootTable: { itemId: string; dropChance: number }[];
}

export class EnemyFactory {
  private static enemyDatabase: Map<string, EnemyData> = new Map();
  private static isLoaded = false;

  static async loadEnemyDatabase(): Promise<void> {
    if (this.isLoaded) return;

    const rows = await CsvParser.parseCsv('/ENEMY_DATABASE.csv');
    
    if (rows.length === 0) {
      throw new Error('Failed to load enemy database: CSV file is empty or missing');
    }
    
    for (const row of rows) {
      const enemyData: EnemyData = {
        name: row['Enemy Name'],
        tier: parseInt(row['Tier']),
        isBoss: row['Boss'] === 'YES',
        health: parseInt(row['Health']),
        evasion: parseInt(row['Evasion']),
        damageReduction: parseFloat(row['Damage Reduction'].replace('%', '')) / 100,
        weaponDamageDice: parseInt(row['Weapon Damage Dice']),
        weaponDamageDieSize: parseInt(row['Weapon Damage Die Size']),
        weaponDamageModifier: parseInt(row['Weapon Damage Modifier']),
        spritePath: row['Sprite Path'],
        hasSprite: row['Has Sprite Asset'] === 'YES',
        lootTable: this.parseLootTable(row['Loot Table']),
      };

      // Create a key using tier and boss status
      const key = `${enemyData.tier}_${enemyData.isBoss ? 'boss' : 'mob'}`;
      this.enemyDatabase.set(key, enemyData);
    }

    this.isLoaded = true;
    console.log('Enemy database loaded:', this.enemyDatabase.size, 'enemy types');
  }

  private static parseLootTable(lootString: string): { itemId: string; dropChance: number }[] {
    const lootTable: { itemId: string; dropChance: number }[] = [];
    
    // Parse format: "potion_health (30%); potion_stamina (25%)"
    const items = lootString.split(';').map(s => s.trim());
    
    for (const item of items) {
      const match = item.match(/(.+?)\s*\((\d+(?:\.\d+)?)%\)/);
      if (match) {
        lootTable.push({
          itemId: match[1].trim(),
          dropChance: parseFloat(match[2]) / 100,
        });
      }
    }
    
    return lootTable;
  }

  private static randomWeaponType(): WeaponType {
    const weaponTypes: WeaponType[] = ['dagger', 'shortsword', 'longsword', 'battleaxe', 'mace', 'warhammer', 'greatsword', 'greataxe', 'spear', 'rapier'];
    return weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
  }

  static createEnemy(tier: number, isBoss: boolean = false): Enemy {
    // Ensure database is loaded (defensive programming)
    if (!this.isLoaded) {
      console.error('Enemy database not loaded! Using fallback enemy.');
      return this.createFallbackEnemy(tier, isBoss);
    }

    const key = `${tier}_${isBoss ? 'boss' : 'mob'}`;
    const enemyData = this.enemyDatabase.get(key);

    if (!enemyData) {
      console.error(`No enemy data found for tier ${tier}, boss: ${isBoss}`);
      return this.createFallbackEnemy(tier, isBoss);
    }

    const weaponDamage: DiceRoll = {
      numDice: enemyData.weaponDamageDice,
      dieSize: enemyData.weaponDamageDieSize,
      modifier: enemyData.weaponDamageModifier,
    };

    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: enemyData.name,
      health: enemyData.health,
      maxHealth: enemyData.health,
      evasion: enemyData.evasion,
      damageReduction: enemyData.damageReduction,
      weaponDamage,
      weaponType: this.randomWeaponType(),
      lootTable: enemyData.lootTable,
      statusConditions: [],
      backstabUsed: false,
    };
  }

  private static createFallbackEnemy(tier: number, isBoss: boolean): Enemy {
    const multiplier = isBoss ? 2.0 : 1.0;
    const baseHealth = 30 + (tier * 15);
    const health = Math.floor(baseHealth * multiplier);

    const weaponDamage: DiceRoll = {
      numDice: 1,
      dieSize: 6,
      modifier: 2,
    };

    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: isBoss ? 'Unknown Boss' : 'Unknown Enemy',
      health,
      maxHealth: health,
      evasion: 10,
      damageReduction: 0,
      weaponDamage,
      weaponType: this.randomWeaponType(),
      lootTable: [],
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
    // Find enemy data by name
    for (const enemyData of this.enemyDatabase.values()) {
      if (enemyData.name === enemyName && enemyData.hasSprite) {
        // Convert sprite path to key: /assets/enemies/void-spawn.png -> void-spawn
        const match = enemyData.spritePath.match(/\/([^/]+)\.png$/);
        return match ? match[1] : null;
      }
    }
    return null;
  }
}
