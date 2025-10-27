import { Delve, DelveRoom } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';

export class DelveGenerator {
  generateDelve(tier: number): Delve {
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
        loot: roomType === 'treasure' ? this.generateLoot(tier) : undefined,
      };

      rooms.set(roomId, room);
    }

    return {
      id: `delve_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tier,
      rooms,
      currentRoomId: entranceRoomId,
      entranceRoomId,
      bossRoomId,
    };
  }

  private getRandomRoomCount(): number {
    const min = GameConfig.DELVE.MIN_ROOMS;
    const max = GameConfig.DELVE.MAX_ROOMS;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private determineRoomType(
    index: number, 
    totalRooms: number
  ): DelveRoom['type'] {
    if (index === 0) return 'combat';
    if (index === totalRooms - 1) return 'boss';
    
    const roll = Math.random();
    if (roll < 0.6) return 'combat';
    if (roll < 0.8) return 'puzzle';
    if (roll < 0.9) return 'trap';
    return 'treasure';
  }

  private generateConnections(index: number, totalRooms: number): string[] {
    const connections: string[] = [];
    
    if (index > 0) {
      connections.push(`room_${index - 1}`);
    }
    
    if (index < totalRooms - 1) {
      connections.push(`room_${index + 1}`);
    }

    return connections;
  }

  private generateEnemyIds(tier: number, isBoss: boolean): string[] {
    if (isBoss) {
      return [`boss_tier${tier}_${Math.floor(Math.random() * 3)}`];
    }
    
    const enemyCount = Math.floor(Math.random() * 3) + 1;
    const enemies: string[] = [];
    
    for (let i = 0; i < enemyCount; i++) {
      enemies.push(`enemy_tier${tier}_${Math.floor(Math.random() * 5)}`);
    }
    
    return enemies;
  }

  private generateLoot(tier: number): any[] {
    return [];
  }
}
