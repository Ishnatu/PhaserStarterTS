import { PlayerData, PlayerEquipment, PlayerStats, WeaponData, ArmorData } from '../types/GameTypes';
import { ItemDatabase } from '../config/ItemDatabase';

export class EquipmentManager {
  static calculatePlayerStats(player: PlayerData): PlayerStats {
    let baseEvasion = 10;
    let calculatedEvasion = baseEvasion;
    let damageReduction = 0;
    const attackBonus = 3;
    
    let damageBonus = 3;

    const mainHandWeapon = player.equipment.mainHand ? ItemDatabase.getWeapon(player.equipment.mainHand) : undefined;
    if (mainHandWeapon?.twoHanded) {
      damageBonus = 6;
    }

    const armorSlots: Array<keyof PlayerEquipment> = ['helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape', 'offHand'];
    
    for (const slot of armorSlots) {
      const itemId = player.equipment[slot];
      if (itemId) {
        const armor = ItemDatabase.getArmor(itemId);
        if (armor) {
          calculatedEvasion += armor.evasionModifier;
          damageReduction += armor.damageReduction;
        }
      }
    }

    return {
      baseEvasion,
      calculatedEvasion,
      damageReduction: Math.min(0.9, damageReduction),
      attackBonus,
      damageBonus,
    };
  }

  static canEquip(player: PlayerData, itemId: string, slot: keyof PlayerEquipment): { canEquip: boolean; reason?: string } {
    const item = ItemDatabase.getItem(itemId);
    
    if (!item) {
      return { canEquip: false, reason: 'Item not found' };
    }

    const weapon = ItemDatabase.getWeapon(itemId);
    if (weapon) {
      if (weapon.twoHanded) {
        if (slot === 'mainHand') {
          if (player.equipment.offHand) {
            return { canEquip: false, reason: 'Two-handed weapons require both hands (unequip off-hand first)' };
          }
          return { canEquip: true };
        }
        return { canEquip: false, reason: 'Two-handed weapons can only be equipped in main hand' };
      }
      
      if (slot === 'mainHand' || slot === 'offHand') {
        const mainHandWeapon = player.equipment.mainHand ? ItemDatabase.getWeapon(player.equipment.mainHand) : undefined;
        if (slot === 'offHand' && mainHandWeapon?.twoHanded) {
          return { canEquip: false, reason: 'Cannot equip off-hand while wielding two-handed weapon' };
        }
        return { canEquip: true };
      }
      
      return { canEquip: false, reason: 'Weapons can only be equipped in weapon slots' };
    }

    const armor = ItemDatabase.getArmor(itemId);
    if (armor) {
      if (armor.slot === 'shield') {
        if (slot !== 'offHand') {
          return { canEquip: false, reason: 'Shields can only be equipped in off-hand' };
        }
        
        const mainHandWeapon = player.equipment.mainHand ? ItemDatabase.getWeapon(player.equipment.mainHand) : undefined;
        if (mainHandWeapon?.twoHanded) {
          return { canEquip: false, reason: 'Cannot use shield with two-handed weapon' };
        }
        
        return { canEquip: true };
      }
      
      if (armor.slot !== slot) {
        return { canEquip: false, reason: `This armor is for ${armor.slot} slot` };
      }
      
      return { canEquip: true };
    }

    return { canEquip: false, reason: 'Unknown item type' };
  }

  static equipItem(player: PlayerData, itemId: string, slot: keyof PlayerEquipment): { success: boolean; message: string } {
    const checkResult = this.canEquip(player, itemId, slot);
    if (!checkResult.canEquip) {
      return { success: false, message: checkResult.reason || 'Cannot equip item' };
    }

    const previousItem = player.equipment[slot];
    if (previousItem) {
      this.addToInventory(player, previousItem, 1);
    }

    this.removeFromInventory(player, itemId, 1);
    player.equipment[slot] = itemId;

    const weapon = ItemDatabase.getWeapon(itemId);
    if (weapon?.twoHanded) {
      player.equipment.offHand = undefined;
    }

    player.stats = this.calculatePlayerStats(player);

    return { success: true, message: `Equipped ${ItemDatabase.getItem(itemId)?.name}` };
  }

  static unequipItem(player: PlayerData, slot: keyof PlayerEquipment): { success: boolean; message: string } {
    const itemId = player.equipment[slot];
    if (!itemId) {
      return { success: false, message: 'No item equipped in that slot' };
    }

    const inventorySpace = player.inventorySlots - player.inventory.reduce((sum, item) => sum + item.quantity, 0);
    if (inventorySpace < 1) {
      return { success: false, message: 'Inventory is full' };
    }

    this.addToInventory(player, itemId, 1);
    player.equipment[slot] = undefined;

    player.stats = this.calculatePlayerStats(player);

    return { success: true, message: `Unequipped ${ItemDatabase.getItem(itemId)?.name}` };
  }

  static getEquippedWeapon(player: PlayerData): WeaponData | undefined {
    if (!player.equipment.mainHand) return undefined;
    return ItemDatabase.getWeapon(player.equipment.mainHand);
  }

  static isDualWielding(player: PlayerData): boolean {
    if (!player.equipment.mainHand || !player.equipment.offHand) return false;
    
    const mainWeapon = ItemDatabase.getWeapon(player.equipment.mainHand);
    const offWeapon = ItemDatabase.getWeapon(player.equipment.offHand);
    
    return !!(mainWeapon && offWeapon && !mainWeapon.twoHanded && !offWeapon.twoHanded);
  }

  static getDualWieldWeapons(player: PlayerData): { mainHand: WeaponData; offHand: WeaponData } | undefined {
    if (!this.isDualWielding(player)) return undefined;
    
    const mainWeapon = ItemDatabase.getWeapon(player.equipment.mainHand!);
    const offWeapon = ItemDatabase.getWeapon(player.equipment.offHand!);
    
    if (mainWeapon && offWeapon) {
      return { mainHand: mainWeapon, offHand: offWeapon };
    }
    
    return undefined;
  }

  private static addToInventory(player: PlayerData, itemId: string, quantity: number): void {
    const existing = player.inventory.find(item => item.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      player.inventory.push({ itemId, quantity });
    }
  }

  private static removeFromInventory(player: PlayerData, itemId: string, quantity: number): boolean {
    const existing = player.inventory.find(item => item.itemId === itemId);
    if (!existing || existing.quantity < quantity) {
      return false;
    }
    
    existing.quantity -= quantity;
    if (existing.quantity === 0) {
      player.inventory = player.inventory.filter(item => item.itemId !== itemId);
    }
    
    return true;
  }
}
