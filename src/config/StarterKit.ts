import { InventoryItem } from '../types/GameTypes';
import { ItemDatabase } from './ItemDatabase';

export interface StarterKitEntry {
  itemId: string;
  quantity: number;
}

export const STARTER_KIT_ITEMS: StarterKitEntry[] = [
  { itemId: 'dagger_basic', quantity: 2 },
  { itemId: 'shortsword_basic', quantity: 2 },
  { itemId: 'rapier_basic', quantity: 2 },
  { itemId: 'longsword_basic', quantity: 2 },
  { itemId: 'battleaxe_basic', quantity: 2 },
  { itemId: 'mace_basic', quantity: 2 },
  { itemId: 'warhammer_basic', quantity: 1 },
  { itemId: 'spear_basic', quantity: 2 },
  { itemId: 'greatsword_basic', quantity: 1 },
  { itemId: 'greataxe_basic', quantity: 1 },
  { itemId: 'staff_basic', quantity: 1 },
  { itemId: 'shield_wooden', quantity: 1 },
  { itemId: 'shield_steel', quantity: 1 },
  { itemId: 'helmet_leather', quantity: 1 },
  { itemId: 'helmet_heavy', quantity: 1 },
  { itemId: 'chest_leather', quantity: 1 },
  { itemId: 'chest_heavy', quantity: 1 },
  { itemId: 'legs_leather', quantity: 1 },
  { itemId: 'legs_heavy', quantity: 1 },
  { itemId: 'boots_leather', quantity: 1 },
  { itemId: 'boots_heavy', quantity: 1 },
  { itemId: 'shoulders_leather', quantity: 1 },
  { itemId: 'shoulders_heavy', quantity: 1 },
  { itemId: 'cape_basic', quantity: 1 },
  { itemId: 'potion_health', quantity: 3 },
  { itemId: 'potion_stamina', quantity: 3 },
];

export const STARTER_KIT_ITEM_IDS: Set<string> = new Set(
  STARTER_KIT_ITEMS.map(entry => entry.itemId)
);

export function generateStarterKitItems(): InventoryItem[] {
  const items: InventoryItem[] = [];
  
  for (const entry of STARTER_KIT_ITEMS) {
    const weapon = ItemDatabase.getWeapon(entry.itemId);
    const armor = ItemDatabase.getArmor(entry.itemId);
    const potion = ItemDatabase.getPotion(entry.itemId);
    
    const itemData = weapon || armor || potion;
    if (!itemData) {
      console.warn(`StarterKit: Unknown item ID "${entry.itemId}"`);
      continue;
    }
    
    for (let i = 0; i < entry.quantity; i++) {
      if (weapon || armor) {
        items.push({
          itemId: entry.itemId,
          quantity: 1,
          enhancementLevel: 0,
          durability: 100,
          maxDurability: 100,
          isStarterKit: true,
        });
      } else if (potion) {
        items.push({
          itemId: entry.itemId,
          quantity: 1,
          isStarterKit: true,
        });
      }
    }
  }
  
  return items;
}

export const WELCOME_MESSAGE = {
  text: "Welcome Delver to Roboka, we wish you luck and skill on your adventure. You will find one of everything you will need in your Vault at the Vault Keepers. Go get em and go hunt down those 999 gems!",
  signature: "Shnato",
  displayDurationMs: 10000,
};
