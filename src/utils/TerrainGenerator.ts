export type TerrainType = 'grass' | 'path' | 'tree';

export interface TerrainTile {
  x: number;
  y: number;
  type: TerrainType;
}

export class TerrainGenerator {
  private static seed: number = 12345;
  
  private static seededRandom(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  static generateTile(x: number, y: number): TerrainType {
    const tileX = Math.floor(x / 32);
    const tileY = Math.floor(y / 32);
    
    this.seed = tileX * 73856093 ^ tileY * 19349663;
    
    const rand = this.seededRandom();
    
    if (rand < 0.05) return 'tree';
    
    if (rand < 0.15) return 'path';
    
    return 'grass';
  }

  static getGrassVariant(x: number, y: number): number {
    const tileX = Math.floor(x / 32);
    const tileY = Math.floor(y / 32);
    
    this.seed = tileX * 73856093 ^ tileY * 19349663 ^ 999;
    
    return Math.floor(this.seededRandom() * 3);
  }
}
