import { PlayerBuff, BuffType, PlayerData } from '../types/GameTypes';

export class BuffManager {
  static addBuff(player: PlayerData, type: BuffType): void {
    this.removeBuff(player, type);

    let buff: PlayerBuff;
    const oneHourMs = 60 * 60 * 1000;

    switch (type) {
      case 'enraged_spirit':
        buff = {
          type: 'enraged_spirit',
          name: 'Blessing of the Enraged Spirit',
          description: '+5 damage per hit',
          expiresAt: Date.now() + oneHourMs,
        };
        break;
      case 'catriena_blessing':
        buff = {
          type: 'catriena_blessing',
          name: 'Blessing of the Angel Cat\'riena',
          description: '+1d4 to all attack rolls',
          expiresAt: Date.now() + oneHourMs,
        };
        break;
      case 'aroma_of_void':
        buff = {
          type: 'aroma_of_void',
          name: 'Aroma of the Void',
          description: '2x encounter rate with void creatures',
          expiresOnTownReturn: true,
        };
        break;
    }

    player.activeBuffs.push(buff);
  }

  static removeBuff(player: PlayerData, type: BuffType): void {
    player.activeBuffs = player.activeBuffs.filter(buff => buff.type !== type);
  }

  static hasBuff(player: PlayerData, type: BuffType): boolean {
    return player.activeBuffs.some(buff => buff.type === type);
  }

  static updateBuffs(player: PlayerData): void {
    const now = Date.now();
    player.activeBuffs = player.activeBuffs.filter(buff => {
      if (buff.expiresAt && buff.expiresAt < now) {
        return false;
      }
      return true;
    });
  }

  static clearTownBuffs(player: PlayerData): void {
    player.activeBuffs = player.activeBuffs.filter(buff => !buff.expiresOnTownReturn);
  }

  static getDamageBonus(player: PlayerData): number {
    if (this.hasBuff(player, 'enraged_spirit')) {
      return 5;
    }
    return 0;
  }

  static getAttackRollBonus(player: PlayerData): { numDice: number; dieSize: number } | null {
    if (this.hasBuff(player, 'catriena_blessing')) {
      return { numDice: 1, dieSize: 4 };
    }
    return null;
  }

  static getEncounterRateMultiplier(player: PlayerData): number {
    if (this.hasBuff(player, 'aroma_of_void')) {
      return 2.0;
    }
    return 1.0;
  }
}
