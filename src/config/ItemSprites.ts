export class ItemSprites {
  private static spriteMap: Map<string, string> = new Map([
    ['dagger_basic', 'assets/items/weapons/iron_dagger.png'],
    ['shortsword_basic', 'assets/items/weapons/shortsword.png'],
    ['rapier_basic', 'assets/items/weapons/dueling_rapier.png'],
    ['longsword_basic', 'assets/items/weapons/longsword.png'],
    ['battleaxe_basic', 'assets/items/weapons/battle_axe.png'],
    ['mace_basic', 'assets/items/weapons/mace.png'],
    ['warhammer_basic', 'assets/items/weapons/warhammer.png'],
    ['greataxe_basic', 'assets/items/weapons/great_axe.png'],
    ['staff_basic', 'assets/items/weapons/quarterstaff.png'],
    ['shield_wooden', 'assets/items/armor/wooden_shield.png'],
    ['shield_steel', 'assets/items/armor/steel_shield.png'],
    ['helmet_leather', 'assets/items/armor/leather_cap.png'],
    ['helmet_heavy', 'assets/items/armor/iron_helmet.png'],
    ['chest_leather', 'assets/items/armor/leather_armor.png'],
    ['chest_heavy', 'assets/items/armor/plate_armor.png'],
    ['legs_leather', 'assets/items/armor/leather_pants.png'],
    ['legs_heavy', 'assets/items/armor/plate_greaves.png'],
    ['boots_leather', 'assets/items/armor/leather_boots.png'],
    ['boots_heavy', 'assets/items/armor/steel_boots.png'],
  ]);

  static getSpriteKey(itemId: string): string | null {
    return this.spriteMap.get(itemId) || null;
  }

  static getAllSpritePaths(): { itemId: string; path: string }[] {
    return Array.from(this.spriteMap.entries()).map(([itemId, path]) => ({
      itemId,
      path
    }));
  }
}
