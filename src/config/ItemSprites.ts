export class ItemSprites {
  private static spriteMap: Map<string, string> = new Map([
    ['shortsword_basic', 'assets/items/weapons/shortsword.png'],
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
