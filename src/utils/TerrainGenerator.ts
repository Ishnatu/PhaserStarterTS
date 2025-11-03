export type TerrainType = 'grass' | 'path' | 'tree' | 'bush' | 'grass_tuft';

export interface TerrainTile {
  x: number;
  y: number;
  type: TerrainType;
}

export class TerrainGenerator {
  private static seed: number = 12345;
  private static delvePositions: { x: number; y: number }[] = [];
  private static readonly DELVE_CLEAR_RADIUS = 80; // 2.5 tiles of clear space around delves
  
  private static seededRandom(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  static setDelvePositions(positions: { x: number; y: number }[]): void {
    this.delvePositions = positions;
  }

  static clearDelvePositions(): void {
    this.delvePositions = [];
  }

  private static isNearDelve(x: number, y: number): boolean {
    // Use tile center for accurate distance calculation (tiles are 32px)
    const tileCenterX = x + 16;
    const tileCenterY = y + 16;
    
    for (const delve of this.delvePositions) {
      const distance = Math.sqrt(
        Math.pow(tileCenterX - delve.x, 2) + Math.pow(tileCenterY - delve.y, 2)
      );
      if (distance < this.DELVE_CLEAR_RADIUS) {
        return true;
      }
    }
    return false;
  }

  static generateTile(x: number, y: number): TerrainType {
    const tileX = Math.floor(x / 32);
    const tileY = Math.floor(y / 32);
    
    this.seed = tileX * 73856093 ^ tileY * 19349663;
    
    const rand = this.seededRandom();
    
    // Don't spawn trees near delves
    if (rand < 0.05 && !this.isNearDelve(x, y)) return 'tree';
    
    // Bushes - less common than trees
    if (rand < 0.08 && !this.isNearDelve(x, y)) return 'bush';
    
    // Grass tufts - more common decoration
    if (rand < 0.20) return 'grass_tuft';
    
    if (rand < 0.30) return 'path';
    
    return 'grass';
  }

  static getGrassVariant(x: number, y: number): number {
    const tileX = Math.floor(x / 32);
    const tileY = Math.floor(y / 32);
    
    this.seed = tileX * 73856093 ^ tileY * 19349663 ^ 999;
    
    return Math.floor(this.seededRandom() * 3);
  }

  static getGrassTuftVariant(x: number, y: number): number {
    const tileX = Math.floor(x / 32);
    const tileY = Math.floor(y / 32);
    
    this.seed = tileX * 73856093 ^ tileY * 19349663 ^ 777;
    
    return Math.floor(this.seededRandom() * 2) + 1; // Returns 1 or 2
  }
}
