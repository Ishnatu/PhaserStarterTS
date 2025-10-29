import { WeaponData, ArmorData, PotionData, DiceRoll } from '../types/GameTypes';

export class ItemDatabase {
  private static weapons: Map<string, WeaponData> = new Map();
  private static armors: Map<string, ArmorData> = new Map();
  private static potions: Map<string, PotionData> = new Map();

  static initialize() {
    this.initializeWeapons();
    this.initializeArmor();
    this.initializePotions();
  }

  private static initializeWeapons() {
    const weapons: WeaponData[] = [
      {
        id: 'dagger_basic',
        name: 'Iron Dagger',
        type: 'dagger',
        damage: { numDice: 1, dieSize: 4, modifier: 3 },
        twoHanded: false,
        rarity: 'common',
        description: 'A simple iron dagger. Light and quick.'
      },
      {
        id: 'shortsword_basic',
        name: 'Steel Shortsword',
        type: 'shortsword',
        damage: { numDice: 1, dieSize: 6, modifier: 3 },
        twoHanded: false,
        rarity: 'common',
        description: 'A reliable short blade for close combat.'
      },
      {
        id: 'rapier_basic',
        name: 'Dueling Rapier',
        type: 'rapier',
        damage: { numDice: 1, dieSize: 8, modifier: 3 },
        twoHanded: false,
        rarity: 'uncommon',
        description: 'A elegant piercing blade favored by duelists.'
      },
      {
        id: 'longsword_basic',
        name: 'Longsword',
        type: 'longsword',
        damage: { numDice: 1, dieSize: 8, modifier: 3 },
        twoHanded: false,
        rarity: 'common',
        description: 'A versatile blade, the weapon of choice for many warriors.'
      },
      {
        id: 'battleaxe_basic',
        name: 'Battle Axe',
        type: 'battleaxe',
        damage: { numDice: 1, dieSize: 8, modifier: 3 },
        twoHanded: false,
        rarity: 'common',
        description: 'A heavy axe designed for brutal strikes.'
      },
      {
        id: 'mace_basic',
        name: 'Steel Mace',
        type: 'mace',
        damage: { numDice: 1, dieSize: 6, modifier: 3 },
        twoHanded: false,
        rarity: 'common',
        description: 'A solid mace for crushing blows.'
      },
      {
        id: 'warhammer_basic',
        name: 'Warhammer',
        type: 'warhammer',
        damage: { numDice: 1, dieSize: 10, modifier: 3 },
        twoHanded: false,
        rarity: 'uncommon',
        description: 'A heavy hammer that can dent even the finest armor.'
      },
      {
        id: 'spear_basic',
        name: 'Spear',
        type: 'spear',
        damage: { numDice: 1, dieSize: 6, modifier: 3 },
        twoHanded: false,
        rarity: 'common',
        description: 'A simple spear with good reach.'
      },
      {
        id: 'greatsword_basic',
        name: 'Greatsword',
        type: 'greatsword',
        damage: { numDice: 2, dieSize: 6, modifier: 6 },
        twoHanded: true,
        rarity: 'uncommon',
        description: 'A massive two-handed sword that cleaves through enemies.'
      },
      {
        id: 'greataxe_basic',
        name: 'Great Axe',
        type: 'greataxe',
        damage: { numDice: 1, dieSize: 12, modifier: 6 },
        twoHanded: true,
        rarity: 'uncommon',
        description: 'An enormous axe requiring two hands to wield.'
      },
      {
        id: 'staff_basic',
        name: 'Quarterstaff',
        type: 'staff',
        damage: { numDice: 1, dieSize: 8, modifier: 6 },
        twoHanded: true,
        rarity: 'common',
        description: 'A long wooden staff used for defense and offense.'
      },
    ];

    weapons.forEach(w => this.weapons.set(w.id, w));
  }

  private static initializeArmor() {
    const armors: ArmorData[] = [
      {
        id: 'shield_wooden',
        name: 'Wooden Shield',
        slot: 'shield',
        armorType: 'shield',
        evasionModifier: 1,
        damageReduction: 0.10,
        rarity: 'common',
        description: 'A simple wooden shield. +1 evasion, 10% damage reduction.'
      },
      {
        id: 'shield_steel',
        name: 'Steel Shield',
        slot: 'shield',
        armorType: 'shield',
        evasionModifier: 1,
        damageReduction: 0.10,
        rarity: 'uncommon',
        description: 'A sturdy steel shield. +1 evasion, 10% damage reduction.'
      },
      {
        id: 'helmet_leather',
        name: 'Leather Cap',
        slot: 'helmet',
        armorType: 'light',
        evasionModifier: 0,
        damageReduction: 0.10,
        rarity: 'common',
        description: 'Light leather headwear. Evasion 9, 10% damage reduction.'
      },
      {
        id: 'helmet_heavy',
        name: 'Iron Helmet',
        slot: 'helmet',
        armorType: 'heavy',
        evasionModifier: -1,
        damageReduction: 0.20,
        rarity: 'common',
        description: 'Heavy iron helmet. Evasion 8, 20% damage reduction.'
      },
      {
        id: 'chest_leather',
        name: 'Leather Armor',
        slot: 'chest',
        armorType: 'light',
        evasionModifier: -1,
        damageReduction: 0.10,
        rarity: 'common',
        description: 'Light leather chest armor. Evasion 9, 10% damage reduction.'
      },
      {
        id: 'chest_heavy',
        name: 'Plate Armor',
        slot: 'chest',
        armorType: 'heavy',
        evasionModifier: -2,
        damageReduction: 0.20,
        rarity: 'uncommon',
        description: 'Heavy plate chest armor. Evasion 8, 20% damage reduction.'
      },
      {
        id: 'legs_leather',
        name: 'Leather Pants',
        slot: 'legs',
        armorType: 'light',
        evasionModifier: 0,
        damageReduction: 0.10,
        rarity: 'common',
        description: 'Light leather leg armor. Evasion 9, 10% damage reduction.'
      },
      {
        id: 'legs_heavy',
        name: 'Plate Greaves',
        slot: 'legs',
        armorType: 'heavy',
        evasionModifier: -1,
        damageReduction: 0.20,
        rarity: 'common',
        description: 'Heavy plate leg armor. Evasion 8, 20% damage reduction.'
      },
      {
        id: 'boots_leather',
        name: 'Leather Boots',
        slot: 'boots',
        armorType: 'light',
        evasionModifier: 0,
        damageReduction: 0.10,
        rarity: 'common',
        description: 'Light leather boots. Evasion 9, 10% damage reduction.'
      },
      {
        id: 'boots_heavy',
        name: 'Steel Boots',
        slot: 'boots',
        armorType: 'heavy',
        evasionModifier: 0,
        damageReduction: 0.20,
        rarity: 'common',
        description: 'Heavy steel boots. Evasion 8, 20% damage reduction.'
      },
      {
        id: 'shoulders_leather',
        name: 'Leather Pauldrons',
        slot: 'shoulders',
        armorType: 'light',
        evasionModifier: 0,
        damageReduction: 0.10,
        rarity: 'common',
        description: 'Light leather shoulder guards. Evasion 9, 10% damage reduction.'
      },
      {
        id: 'shoulders_heavy',
        name: 'Steel Pauldrons',
        slot: 'shoulders',
        armorType: 'heavy',
        evasionModifier: 0,
        damageReduction: 0.20,
        rarity: 'uncommon',
        description: 'Heavy steel shoulder guards. Evasion 8, 20% damage reduction.'
      },
      {
        id: 'cape_basic',
        name: 'Traveler\'s Cloak',
        slot: 'cape',
        armorType: 'light',
        evasionModifier: 0,
        damageReduction: 0,
        rarity: 'common',
        description: 'A simple traveling cloak. Provides minimal protection.'
      },
    ];

    armors.forEach(a => this.armors.set(a.id, a));
  }

  private static initializePotions() {
    const potions: PotionData[] = [
      {
        id: 'potion_health',
        name: 'Health Potion',
        type: 'health',
        restoration: { numDice: 2, dieSize: 4, modifier: 8 },
        rarity: 'common',
        description: 'Restores 2d4+8 health when consumed.'
      },
      {
        id: 'potion_stamina',
        name: 'Stamina Potion',
        type: 'stamina',
        restoration: { numDice: 2, dieSize: 4, modifier: 8 },
        rarity: 'common',
        description: 'Restores 2d4+8 stamina when consumed.'
      },
    ];

    potions.forEach(p => this.potions.set(p.id, p));
  }

  static getWeapon(id: string): WeaponData | undefined {
    return this.weapons.get(id);
  }

  static getArmor(id: string): ArmorData | undefined {
    return this.armors.get(id);
  }

  static getPotion(id: string): PotionData | undefined {
    return this.potions.get(id);
  }

  static getAllWeapons(): WeaponData[] {
    return Array.from(this.weapons.values());
  }

  static getAllArmor(): ArmorData[] {
    return Array.from(this.armors.values());
  }

  static getAllPotions(): PotionData[] {
    return Array.from(this.potions.values());
  }

  static getItem(id: string): WeaponData | ArmorData | PotionData | undefined {
    return this.getWeapon(id) || this.getArmor(id) || this.getPotion(id);
  }
}

ItemDatabase.initialize();
