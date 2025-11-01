import { PlayerData, PlayerEquipment, PlayerStats, WeaponData, ArmorData, EquippedItem, InventoryItem } from '../types/GameTypes';
import { ItemDatabase } from '../config/ItemDatabase';
import { ForgingSystem } from './ForgingSystem';

export class EquipmentManager {
  static calculatePlayerStats(player: PlayerData): PlayerStats {
    let baseEvasion = 10;
    let calculatedEvasion = baseEvasion;
    let damageReduction = 0;
    const attackBonus = 3;
    
    let damageBonus = 3;

    const mainHandWeapon = player.equipment.mainHand ? ItemDatabase.getWeapon(player.equipment.mainHand.itemId) : undefined;
    if (mainHandWeapon?.twoHanded) {
      damageBonus = 6;
    }

    const armorSlots: Array<keyof PlayerEquipment> = ['helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape', 'offHand'];
    
    for (const slot of armorSlots) {
      const equipped = player.equipment[slot];
      if (equipped) {
        const armor = ItemDatabase.getArmor(equipped.itemId);
        if (armor) {
          calculatedEvasion += armor.evasionModifier;
          damageReduction += armor.damageReduction;
          
          // Apply enhancement bonuses for armor
          // +5, +7, +9: light armor gets +2 evasion, heavy armor gets +10% DR
          const enhancementLevel = equipped.enhancementLevel || 0;
          if (enhancementLevel >= 5) {
            if (armor.armorType === 'light') {
              calculatedEvasion += 2;
            } else if (armor.armorType === 'heavy') {
              damageReduction += 0.10;
            }
          }
          if (enhancementLevel >= 7) {
            if (armor.armorType === 'light') {
              calculatedEvasion += 2;
            } else if (armor.armorType === 'heavy') {
              damageReduction += 0.10;
            }
          }
          if (enhancementLevel >= 9) {
            if (armor.armorType === 'light') {
              calculatedEvasion += 2;
            } else if (armor.armorType === 'heavy') {
              damageReduction += 0.10;
            }
          }
        }
      }
    }

    return {
      baseEvasion,
      calculatedEvasion,
      damageReduction: Math.min(0.50, damageReduction), // Cap at 50%
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
        const mainHandWeapon = player.equipment.mainHand ? ItemDatabase.getWeapon(player.equipment.mainHand.itemId) : undefined;
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
        
        const mainHandWeapon = player.equipment.mainHand ? ItemDatabase.getWeapon(player.equipment.mainHand.itemId) : undefined;
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

    const invItem = player.inventory.find(item => item.itemId === itemId);
    if (!invItem) {
      return { success: false, message: 'Item not in inventory' };
    }

    // Check durability - cannot equip broken items
    const currentDurability = invItem.durability ?? 100;
    if (currentDurability <= 0) {
      return { success: false, message: 'Item is broken and needs repair!' };
    }

    const previousItem = player.equipment[slot];
    if (previousItem) {
      this.addToInventory(player, previousItem.itemId, 1, previousItem.enhancementLevel, previousItem.durability, previousItem.maxDurability);
    }

    this.removeFromInventory(player, itemId, 1);
    player.equipment[slot] = { 
      itemId, 
      enhancementLevel: invItem.enhancementLevel || 0,
      durability: invItem.durability,
      maxDurability: invItem.maxDurability
    };

    const weapon = ItemDatabase.getWeapon(itemId);
    if (weapon?.twoHanded) {
      player.equipment.offHand = undefined;
    }

    player.stats = this.calculatePlayerStats(player);

    const displayName = ForgingSystem.getItemDisplayName(invItem);
    return { success: true, message: `Equipped ${displayName}` };
  }

  static unequipItem(player: PlayerData, slot: keyof PlayerEquipment): { success: boolean; message: string } {
    const equipped = player.equipment[slot];
    if (!equipped) {
      return { success: false, message: 'No item equipped in that slot' };
    }

    const inventorySpace = player.inventorySlots - player.inventory.reduce((sum, item) => sum + item.quantity, 0);
    if (inventorySpace < 1) {
      return { success: false, message: 'Inventory is full' };
    }

    this.addToInventory(player, equipped.itemId, 1, equipped.enhancementLevel, equipped.durability, equipped.maxDurability);
    player.equipment[slot] = undefined;

    player.stats = this.calculatePlayerStats(player);

    const displayName = ForgingSystem.getItemDisplayName({ itemId: equipped.itemId, quantity: 1, enhancementLevel: equipped.enhancementLevel });
    return { success: true, message: `Unequipped ${displayName}` };
  }

  static getEquippedWeapon(player: PlayerData): WeaponData | undefined {
    if (!player.equipment.mainHand) return undefined;
    return ItemDatabase.getWeapon(player.equipment.mainHand.itemId);
  }

  static getEquippedWeaponWithEnhancement(player: PlayerData): { weapon: WeaponData; enhancementLevel: number } | undefined {
    if (!player.equipment.mainHand) return undefined;
    const weapon = ItemDatabase.getWeapon(player.equipment.mainHand.itemId);
    if (!weapon) return undefined;
    return { 
      weapon, 
      enhancementLevel: player.equipment.mainHand.enhancementLevel || 0 
    };
  }

  static isDualWielding(player: PlayerData): boolean {
    if (!player.equipment.mainHand || !player.equipment.offHand) return false;
    
    const mainWeapon = ItemDatabase.getWeapon(player.equipment.mainHand.itemId);
    const offWeapon = ItemDatabase.getWeapon(player.equipment.offHand.itemId);
    
    return !!(mainWeapon && offWeapon && !mainWeapon.twoHanded && !offWeapon.twoHanded);
  }

  static getDualWieldWeapons(player: PlayerData): { mainHand: WeaponData; mainHandLevel: number; offHand: WeaponData; offHandLevel: number } | undefined {
    if (!this.isDualWielding(player)) return undefined;
    
    const mainWeapon = ItemDatabase.getWeapon(player.equipment.mainHand!.itemId);
    const offWeapon = ItemDatabase.getWeapon(player.equipment.offHand!.itemId);
    
    if (mainWeapon && offWeapon) {
      return { 
        mainHand: mainWeapon, 
        mainHandLevel: player.equipment.mainHand!.enhancementLevel || 0,
        offHand: offWeapon,
        offHandLevel: player.equipment.offHand!.enhancementLevel || 0
      };
    }
    
    return undefined;
  }

  private static addToInventory(player: PlayerData, itemId: string, quantity: number, enhancementLevel?: number, durability?: number, maxDurability?: number): void {
    // For stackable items (potions), we can stack them
    const potion = ItemDatabase.getPotion(itemId);
    if (potion) {
      const existing = player.inventory.find(item => item.itemId === itemId);
      if (existing) {
        existing.quantity += quantity;
        return;
      }
    }
    
    // For equipment (weapons/armor), each item is unique with its own durability
    // Initialize durability if not provided
    const finalDurability = durability ?? 100;
    const finalMaxDurability = maxDurability ?? (100 + (enhancementLevel || 0) * 10);
    
    player.inventory.push({ 
      itemId, 
      quantity, 
      enhancementLevel,
      durability: finalDurability,
      maxDurability: finalMaxDurability
    });
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
