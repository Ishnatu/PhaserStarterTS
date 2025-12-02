import { Delve, DelveRoom } from '../../shared/types';
import { SeededRNG } from '../utils/SeededRNG';

export class DelveGenerator {
  private static readonly MIN_ROOMS = 3;
  private static readonly MAX_ROOMS = 5;
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  generateDelve(tier: number): Delve {
    // [SERVER RNG] Random room count between 3-5
    const numRooms = this.getRandomRoomCount();
    const rooms = new Map<string, DelveRoom>();
    
    const entranceRoomId = 'room_0';
    const bossRoomId = `room_${numRooms - 1}`;

    for (let i = 0; i < numRooms; i++) {
      const roomId = `room_${i}`;
      const roomType = this.determineRoomType(i, numRooms);
      
      const room: DelveRoom = {
        id: roomId,
        type: roomType,
        completed: false,
        connections: this.generateConnections(i, numRooms),
        enemyIds: roomType === 'combat' || roomType === 'boss' 
          ? this.generateEnemyIds(tier, roomType === 'boss') 
          : undefined,
        loot: roomType === 'treasure' ? [] : undefined,
      };

      rooms.set(roomId, room);
    }

    // [SERVER RNG] Generate unique delve ID using seeded RNG
    const randomSuffix = this.rng.nextInt(100000, 999999, 'delve ID');
    
    return {
      id: `delve_${Date.now()}_${randomSuffix}`,
      tier,
      rooms,
      currentRoomId: entranceRoomId,
      entranceRoomId,
      bossRoomId,
    };
  }

  private getRandomRoomCount(): number {
    // [SERVER RNG] Random room count
    return this.rng.nextInt(DelveGenerator.MIN_ROOMS, DelveGenerator.MAX_ROOMS, 'room count');
  }

  private determineRoomType(
    index: number, 
    totalRooms: number
  ): DelveRoom['type'] {
    // First room is always combat
    if (index === 0) return 'combat';
    // Last room is always boss
    if (index === totalRooms - 1) return 'boss';
    
    // [SERVER RNG] Random room type for middle rooms
    const roll = this.rng.next('room type');
    if (roll < 0.6) return 'combat';
    if (roll < 0.8) return 'puzzle';
    if (roll < 0.9) return 'trap';
    return 'treasure';
  }

  private generateConnections(index: number, totalRooms: number): string[] {
    const connections: string[] = [];
    
    // Connect to previous room
    if (index > 0) {
      connections.push(`room_${index - 1}`);
    }
    
    // Connect to next room
    if (index < totalRooms - 1) {
      connections.push(`room_${index + 1}`);
    }

    return connections;
  }

  private generateEnemyIds(tier: number, isBoss: boolean): string[] {
    if (isBoss) {
      // [SERVER RNG] Boss encounter - single boss enemy
      return [`boss_tier${tier}_${this.rng.nextInt(0, 2, 'boss variant')}`];
    }
    
    // [SERVER RNG] Regular combat - 1-2 enemies (max 2 standard monsters)
    const enemyCount = this.rng.nextInt(1, 2, 'enemy count');
    const enemies: string[] = [];
    
    for (let i = 0; i < enemyCount; i++) {
      enemies.push(`enemy_tier${tier}_${this.rng.nextInt(0, 4, 'enemy variant')}`);
    }
    
    return enemies;
  }
}
