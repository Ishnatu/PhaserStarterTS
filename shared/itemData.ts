import type { WeaponData, ArmorData, PotionData, PlayerEquipment, PlayerStats } from './types';

const weapons: Map<string, WeaponData> = new Map();
const armors: Map<string, ArmorData> = new Map();
const potions: Map<string, PotionData> = new Map();

function initializeWeapons() {
  const weaponList: WeaponData[] = [
    { id: 'dagger_basic', name: 'Iron Dagger', type: 'dagger', damage: { numDice: 1, dieSize: 4, modifier: 3 }, twoHanded: false, rarity: 'common', description: 'A simple iron dagger. Light and quick.' },
    { id: 'shortsword_basic', name: 'Steel Shortsword', type: 'shortsword', damage: { numDice: 1, dieSize: 6, modifier: 3 }, twoHanded: false, rarity: 'common', description: 'A reliable short blade for close combat.' },
    { id: 'rapier_basic', name: 'Dueling Rapier', type: 'rapier', damage: { numDice: 1, dieSize: 8, modifier: 3 }, twoHanded: false, rarity: 'uncommon', description: 'A elegant piercing blade favored by duelists.' },
    { id: 'longsword_basic', name: 'Longsword', type: 'longsword', damage: { numDice: 1, dieSize: 8, modifier: 3 }, twoHanded: false, rarity: 'common', description: 'A versatile blade, the weapon of choice for many warriors.' },
    { id: 'battleaxe_basic', name: 'Battle Axe', type: 'battleaxe', damage: { numDice: 1, dieSize: 8, modifier: 3 }, twoHanded: false, rarity: 'common', description: 'A heavy axe designed for brutal strikes.' },
    { id: 'mace_basic', name: 'Steel Mace', type: 'mace', damage: { numDice: 1, dieSize: 6, modifier: 3 }, twoHanded: false, rarity: 'common', description: 'A solid mace for crushing blows.' },
    { id: 'warhammer_basic', name: 'Warhammer', type: 'warhammer', damage: { numDice: 1, dieSize: 10, modifier: 3 }, twoHanded: false, rarity: 'uncommon', description: 'A heavy hammer that can dent even the finest armor.' },
    { id: 'spear_basic', name: 'Spear', type: 'spear', damage: { numDice: 1, dieSize: 6, modifier: 3 }, twoHanded: false, rarity: 'common', description: 'A simple spear with good reach.' },
    { id: 'greatsword_basic', name: 'Greatsword', type: 'greatsword', damage: { numDice: 2, dieSize: 6, modifier: 6 }, twoHanded: true, rarity: 'uncommon', description: 'A massive two-handed sword that cleaves through enemies.' },
    { id: 'greataxe_basic', name: 'Great Axe', type: 'greataxe', damage: { numDice: 1, dieSize: 12, modifier: 6 }, twoHanded: true, rarity: 'uncommon', description: 'An enormous axe requiring two hands to wield.' },
    { id: 'staff_basic', name: 'Quarterstaff', type: 'staff', damage: { numDice: 1, dieSize: 8, modifier: 6 }, twoHanded: true, rarity: 'common', description: 'A long wooden staff used for defense and offense.' },
  ];
  weaponList.forEach(w => weapons.set(w.id, w));
}

function initializeArmor() {
  const armorList: ArmorData[] = [
    { id: 'shield_wooden', name: 'Wooden Shield', slot: 'shield', armorType: 'shield', evasionModifier: 1, damageReduction: 0.10, rarity: 'common', description: 'A simple wooden shield. +1 evasion, 10% damage reduction.' },
    { id: 'shield_steel', name: 'Steel Shield', slot: 'shield', armorType: 'shield', evasionModifier: 1, damageReduction: 0.10, rarity: 'uncommon', description: 'A sturdy steel shield. +1 evasion, 10% damage reduction.' },
    { id: 'helmet_leather', name: 'Leather Cap', slot: 'helmet', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: 'Light leather headwear. +1 evasion.' },
    { id: 'helmet_heavy', name: 'Iron Helmet', slot: 'helmet', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.02, rarity: 'common', description: 'Heavy iron helmet. -1 evasion, 2% damage reduction.' },
    { id: 'chest_leather', name: 'Leather Armor', slot: 'chest', armorType: 'light', evasionModifier: -1, damageReduction: 0.10, rarity: 'common', description: 'Light leather chest armor. -1 evasion, 10% damage reduction.' },
    { id: 'chest_heavy', name: 'Plate Armor', slot: 'chest', armorType: 'heavy', evasionModifier: -2, damageReduction: 0.20, rarity: 'uncommon', description: 'Heavy plate chest armor. -2 evasion, 20% damage reduction.' },
    { id: 'legs_leather', name: 'Leather Pants', slot: 'legs', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: 'Light leather leg armor. +1 evasion.' },
    { id: 'legs_heavy', name: 'Plate Greaves', slot: 'legs', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.02, rarity: 'common', description: 'Heavy plate leg armor. -1 evasion, 2% damage reduction.' },
    { id: 'boots_leather', name: 'Leather Boots', slot: 'boots', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: 'Light leather boots. +1 evasion.' },
    { id: 'boots_heavy', name: 'Steel Boots', slot: 'boots', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.02, rarity: 'common', description: 'Heavy steel boots. -1 evasion, 2% damage reduction.' },
    { id: 'shoulders_leather', name: 'Leather Pauldrons', slot: 'shoulders', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: 'Light leather shoulder guards. +1 evasion.' },
    { id: 'shoulders_heavy', name: 'Steel Pauldrons', slot: 'shoulders', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.02, rarity: 'uncommon', description: 'Heavy steel shoulder guards. -1 evasion, 2% damage reduction.' },
    { id: 'cape_basic', name: "Traveler's Cloak", slot: 'cape', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: 'A simple traveling cloak. +1 evasion.' },
  ];
  armorList.forEach(a => armors.set(a.id, a));
}

function initializePotions() {
  const potionList: PotionData[] = [
    { id: 'potion_health', name: 'Health Potion', type: 'health', restoration: { numDice: 8, dieSize: 4, modifier: 15 }, rarity: 'common', description: 'Restores 8d4+15 health when consumed.' },
    { id: 'potion_stamina', name: 'Stamina Potion', type: 'stamina', restoration: { numDice: 8, dieSize: 4, modifier: 15 }, rarity: 'common', description: 'Restores 8d4+15 stamina when consumed.' },
  ];
  potionList.forEach(p => potions.set(p.id, p));
}

let initialized = false;

export function initializeItemData() {
  if (initialized) return;
  initializeWeapons();
  initializeArmor();
  initializePotions();
  initialized = true;
}

export function getWeapon(id: string): WeaponData | undefined {
  initializeItemData();
  return weapons.get(id);
}

export function getArmor(id: string): ArmorData | undefined {
  initializeItemData();
  return armors.get(id);
}

export function getPotion(id: string): PotionData | undefined {
  initializeItemData();
  return potions.get(id);
}

export function getAllWeaponIds(): string[] {
  initializeItemData();
  return Array.from(weapons.keys());
}

export function getAllArmorIds(): string[] {
  initializeItemData();
  return Array.from(armors.keys());
}

export function getAllPotionIds(): string[] {
  initializeItemData();
  return Array.from(potions.keys());
}

export function getAllValidItemIds(): Set<string> {
  initializeItemData();
  const ids = new Set<string>();
  weapons.forEach((_, id) => ids.add(id));
  armors.forEach((_, id) => ids.add(id));
  potions.forEach((_, id) => ids.add(id));
  return ids;
}

export function calculatePlayerStats(equipment: PlayerEquipment): PlayerStats {
  let baseEvasion = 10;
  let calculatedEvasion = baseEvasion;
  let damageReduction = 0;
  const attackBonus = 3;
  let damageBonus = 3;

  const mainHandWeapon = equipment.mainHand ? getWeapon(equipment.mainHand.itemId) : undefined;
  if (mainHandWeapon?.twoHanded) {
    damageBonus = 6;
  }

  const armorSlots: Array<keyof PlayerEquipment> = ['helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape', 'offHand'];

  for (const slot of armorSlots) {
    const equipped = equipment[slot];
    if (equipped) {
      const armor = getArmor(equipped.itemId);
      if (armor) {
        calculatedEvasion += armor.evasionModifier;
        damageReduction += armor.damageReduction;

        const enhancementLevel = equipped.enhancementLevel || 0;
        if (enhancementLevel > 0) {
          damageReduction += enhancementLevel * 0.01;
        }
      }
    }
  }

  damageReduction = Math.min(damageReduction, 0.75);

  return {
    baseEvasion,
    calculatedEvasion,
    damageReduction,
    attackBonus,
    damageBonus
  };
}
