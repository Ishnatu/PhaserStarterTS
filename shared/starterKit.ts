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

export function getStarterKitItemCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of STARTER_KIT_ITEMS) {
    counts.set(entry.itemId, entry.quantity);
  }
  return counts;
}
