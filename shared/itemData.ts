import type { WeaponData, ArmorData, PotionData, PlayerEquipment, PlayerStats } from './types';

const weapons: Map<string, WeaponData> = new Map();
const armors: Map<string, ArmorData> = new Map();
const potions: Map<string, PotionData> = new Map();

function initializeWeapons() {
  const weaponList: WeaponData[] = [
    { id: 'dagger_basic', name: 'Iron Dagger', type: 'dagger', damage: { numDice: 1, dieSize: 4, modifier: 3 }, twoHanded: false, rarity: 'common', description: '' },
    { id: 'shortsword_basic', name: 'Steel Shortsword', type: 'shortsword', damage: { numDice: 1, dieSize: 6, modifier: 3 }, twoHanded: false, rarity: 'common', description: '' },
    { id: 'rapier_basic', name: 'Dueling Rapier', type: 'rapier', damage: { numDice: 1, dieSize: 8, modifier: 3 }, twoHanded: false, rarity: 'uncommon', description: '' },
    { id: 'longsword_basic', name: 'Longsword', type: 'longsword', damage: { numDice: 1, dieSize: 8, modifier: 3 }, twoHanded: false, rarity: 'common', description: '' },
    { id: 'battleaxe_basic', name: 'Battle Axe', type: 'battleaxe', damage: { numDice: 1, dieSize: 8, modifier: 3 }, twoHanded: false, rarity: 'common', description: '' },
    { id: 'mace_basic', name: 'Steel Mace', type: 'mace', damage: { numDice: 1, dieSize: 6, modifier: 3 }, twoHanded: false, rarity: 'common', description: '' },
    { id: 'warhammer_basic', name: 'Warhammer', type: 'warhammer', damage: { numDice: 1, dieSize: 10, modifier: 3 }, twoHanded: false, rarity: 'uncommon', description: '' },
    { id: 'spear_basic', name: 'Spear', type: 'spear', damage: { numDice: 1, dieSize: 6, modifier: 3 }, twoHanded: false, rarity: 'common', description: '' },
    { id: 'greatsword_basic', name: 'Greatsword', type: 'greatsword', damage: { numDice: 2, dieSize: 6, modifier: 6 }, twoHanded: true, rarity: 'uncommon', description: '' },
    { id: 'greataxe_basic', name: 'Great Axe', type: 'greataxe', damage: { numDice: 1, dieSize: 12, modifier: 6 }, twoHanded: true, rarity: 'uncommon', description: '' },
    { id: 'staff_basic', name: 'Quarterstaff', type: 'staff', damage: { numDice: 1, dieSize: 8, modifier: 6 }, twoHanded: true, rarity: 'common', description: '' },
  ];
  weaponList.forEach(w => weapons.set(w.id, w));
}

function initializeArmor() {
  const armorList: ArmorData[] = [
    { id: 'shield_wooden', name: 'Wooden Shield', slot: 'shield', armorType: 'shield', evasionModifier: 0, damageReduction: 0.05, rarity: 'common', description: '' },
    { id: 'shield_steel', name: 'Steel Shield', slot: 'shield', armorType: 'shield', evasionModifier: -1, damageReduction: 0.10, rarity: 'uncommon', description: '' },
    { id: 'leather_cap', name: 'Leather Cap', slot: 'helmet', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: '' },
    { id: 'steel_helm', name: 'Steel Helm', slot: 'helmet', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.05, rarity: 'uncommon', description: '' },
    { id: 'leather_vest', name: 'Leather Vest', slot: 'chest', armorType: 'light', evasionModifier: 2, damageReduction: 0, rarity: 'common', description: '' },
    { id: 'chainmail', name: 'Chainmail', slot: 'chest', armorType: 'heavy', evasionModifier: -2, damageReduction: 0.10, rarity: 'uncommon', description: '' },
    { id: 'plate_armor', name: 'Plate Armor', slot: 'chest', armorType: 'heavy', evasionModifier: -3, damageReduction: 0.15, rarity: 'rare', description: '' },
    { id: 'leather_pants', name: 'Leather Pants', slot: 'legs', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: '' },
    { id: 'chain_leggings', name: 'Chain Leggings', slot: 'legs', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.05, rarity: 'uncommon', description: '' },
    { id: 'leather_boots', name: 'Leather Boots', slot: 'boots', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: '' },
    { id: 'steel_boots', name: 'Steel Boots', slot: 'boots', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.03, rarity: 'uncommon', description: '' },
    { id: 'leather_pauldrons', name: 'Leather Pauldrons', slot: 'shoulders', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: '' },
    { id: 'steel_pauldrons', name: 'Steel Pauldrons', slot: 'shoulders', armorType: 'heavy', evasionModifier: -1, damageReduction: 0.03, rarity: 'uncommon', description: '' },
    { id: 'traveling_cloak', name: 'Traveling Cloak', slot: 'cape', armorType: 'light', evasionModifier: 1, damageReduction: 0, rarity: 'common', description: '' },
  ];
  armorList.forEach(a => armors.set(a.id, a));
}

function initializePotions() {
  const potionList: PotionData[] = [
    { id: 'health_potion_small', name: 'Small Health Potion', type: 'health', restoration: { numDice: 2, dieSize: 4, modifier: 2 }, rarity: 'common', description: '' },
    { id: 'health_potion_medium', name: 'Medium Health Potion', type: 'health', restoration: { numDice: 4, dieSize: 4, modifier: 4 }, rarity: 'uncommon', description: '' },
    { id: 'stamina_potion_small', name: 'Small Stamina Potion', type: 'stamina', restoration: { numDice: 2, dieSize: 6, modifier: 2 }, rarity: 'common', description: '' },
    { id: 'stamina_potion_medium', name: 'Medium Stamina Potion', type: 'stamina', restoration: { numDice: 4, dieSize: 6, modifier: 4 }, rarity: 'uncommon', description: '' },
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
        if (enhancementLevel >= 5) {
          if (armor.armorType === 'light') calculatedEvasion += 2;
          else if (armor.armorType === 'heavy') damageReduction += 0.10;
        }
        if (enhancementLevel >= 7) {
          if (armor.armorType === 'light') calculatedEvasion += 2;
          else if (armor.armorType === 'heavy') damageReduction += 0.10;
        }
        if (enhancementLevel >= 9) {
          if (armor.armorType === 'light') calculatedEvasion += 2;
          else if (armor.armorType === 'heavy') damageReduction += 0.10;
        }
      }
    }
  }

  return {
    baseEvasion,
    calculatedEvasion,
    damageReduction: Math.min(0.50, damageReduction),
    attackBonus,
    damageBonus,
  };
}
