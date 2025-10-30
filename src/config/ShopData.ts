export interface ShopItem {
  itemId: string;
  price: number;
  currency: 'AA' | 'CA';
}

export class ShopData {
  private static shopItems: Map<string, ShopItem> = new Map();

  static initialize() {
    const items: ShopItem[] = [
      { itemId: 'dagger_basic', price: 50, currency: 'AA' },
      { itemId: 'shortsword_basic', price: 75, currency: 'AA' },
      { itemId: 'rapier_basic', price: 150, currency: 'AA' },
      { itemId: 'longsword_basic', price: 100, currency: 'AA' },
      { itemId: 'battleaxe_basic', price: 100, currency: 'AA' },
      { itemId: 'mace_basic', price: 75, currency: 'AA' },
      { itemId: 'warhammer_basic', price: 175, currency: 'AA' },
      { itemId: 'spear_basic', price: 60, currency: 'AA' },
      { itemId: 'greatsword_basic', price: 250, currency: 'AA' },
      { itemId: 'greataxe_basic', price: 275, currency: 'AA' },
      { itemId: 'staff_basic', price: 150, currency: 'AA' },
      
      { itemId: 'shield_wooden', price: 75, currency: 'AA' },
      { itemId: 'shield_steel', price: 125, currency: 'AA' },
      { itemId: 'helmet_leather', price: 40, currency: 'AA' },
      { itemId: 'helmet_heavy', price: 80, currency: 'AA' },
      { itemId: 'chest_leather', price: 60, currency: 'AA' },
      { itemId: 'chest_heavy', price: 120, currency: 'AA' },
      { itemId: 'legs_leather', price: 50, currency: 'AA' },
      { itemId: 'legs_heavy', price: 90, currency: 'AA' },
      { itemId: 'boots_leather', price: 35, currency: 'AA' },
      { itemId: 'boots_heavy', price: 70, currency: 'AA' },
      { itemId: 'shoulders_leather', price: 40, currency: 'AA' },
      { itemId: 'shoulders_heavy', price: 85, currency: 'AA' },
      { itemId: 'cape_basic', price: 30, currency: 'AA' },
      
      { itemId: 'potion_health', price: 25, currency: 'AA' },
      { itemId: 'potion_stamina', price: 25, currency: 'AA' },
    ];

    items.forEach(item => this.shopItems.set(item.itemId, item));
  }

  static getShopItem(itemId: string): ShopItem | undefined {
    return this.shopItems.get(itemId);
  }

  static getAllShopItems(): ShopItem[] {
    return Array.from(this.shopItems.values());
  }

  static getWeaponShopItems(): ShopItem[] {
    const weaponIds = [
      'dagger_basic', 'shortsword_basic', 'rapier_basic', 'longsword_basic',
      'battleaxe_basic', 'mace_basic', 'warhammer_basic', 'spear_basic',
      'greatsword_basic', 'greataxe_basic', 'staff_basic'
    ];
    return weaponIds.map(id => this.shopItems.get(id)!).filter(item => item);
  }

  static getArmorShopItems(): ShopItem[] {
    const armorIds = [
      'shield_wooden', 'shield_steel', 'helmet_leather', 'helmet_heavy',
      'chest_leather', 'chest_heavy', 'legs_leather', 'legs_heavy',
      'boots_leather', 'boots_heavy', 'shoulders_leather', 'shoulders_heavy',
      'cape_basic'
    ];
    return armorIds.map(id => this.shopItems.get(id)!).filter(item => item);
  }

  static getPotionShopItems(): ShopItem[] {
    const potionIds = ['potion_health', 'potion_stamina'];
    return potionIds.map(id => this.shopItems.get(id)!).filter(item => item);
  }
}

ShopData.initialize();
