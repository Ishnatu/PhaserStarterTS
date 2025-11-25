import { InventoryItem } from '../types/GameTypes';
import { ItemDatabase } from './ItemDatabase';
import { STARTER_KIT_ITEMS, STARTER_KIT_ITEM_IDS } from '../../shared/starterKit';
import type { StarterKitEntry } from '../../shared/starterKit';

export { STARTER_KIT_ITEMS, STARTER_KIT_ITEM_IDS };
export type { StarterKitEntry };

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
