import { PlayerData, EquippedItem } from '../types/GameTypes';
import { ItemDatabase } from '../config/ItemDatabase';

export class DurabilityManager {
  // Decay weapons by 1 durability per combat
  static decayWeaponsAfterCombat(player: PlayerData): string[] {
    const messages: string[] = [];
    
    if (player.equipment.mainHand) {
      const result = this.decayEquipmentItem(player.equipment.mainHand, 1);
      if (result) messages.push(result);
    }
    
    if (player.equipment.offHand) {
      const weapon = ItemDatabase.getWeapon(player.equipment.offHand.itemId);
      if (weapon) {
        const result = this.decayEquipmentItem(player.equipment.offHand, 1);
        if (result) messages.push(result);
      }
    }
    
    return messages;
  }
  
  // Decay armor by 1 durability per combat
  static decayArmorAfterCombat(player: PlayerData): string[] {
    const messages: string[] = [];
    const armorSlots: Array<keyof typeof player.equipment> = ['helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape'];
    
    for (const slot of armorSlots) {
      const equipped = player.equipment[slot];
      if (equipped) {
        const result = this.decayEquipmentItem(equipped, 1);
        if (result) messages.push(result);
      }
    }
    
    // Shield (in offHand) also decays with armor
    if (player.equipment.offHand) {
      const shield = ItemDatabase.getArmor(player.equipment.offHand.itemId);
      if (shield) {
        const result = this.decayEquipmentItem(player.equipment.offHand, 1);
        if (result) messages.push(result);
      }
    }
    
    return messages;
  }
  
  // Decay armor by 0.1 durability per tile moved (1 durability per 10 tiles)
  static decayArmorAfterMovement(player: PlayerData, tiles: number): string[] {
    const messages: string[] = [];
    const armorSlots: Array<keyof typeof player.equipment> = ['helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape'];
    const decayAmount = tiles * 0.1;
    
    for (const slot of armorSlots) {
      const equipped = player.equipment[slot];
      if (equipped) {
        const result = this.decayEquipmentItem(equipped, decayAmount);
        if (result) messages.push(result);
      }
    }
    
    // Shield also decays with movement
    if (player.equipment.offHand) {
      const shield = ItemDatabase.getArmor(player.equipment.offHand.itemId);
      if (shield) {
        const result = this.decayEquipmentItem(player.equipment.offHand, decayAmount);
        if (result) messages.push(result);
      }
    }
    
    return messages;
  }
  
  private static decayEquipmentItem(item: EquippedItem, amount: number): string | null {
    const currentDurability = item.durability ?? 100;
    const maxDurability = item.maxDurability ?? 100;
    
    // Already broken
    if (currentDurability <= 0) {
      return null;
    }
    
    const newDurability = Math.max(0, currentDurability - amount);
    item.durability = newDurability;
    
    // Item just broke
    if (newDurability === 0 && currentDurability > 0) {
      const itemData = ItemDatabase.getItem(item.itemId);
      const itemName = itemData?.name || 'Item';
      return `${itemName} has broken and needs repair!`;
    }
    
    // Warn when low durability
    const percentage = (newDurability / maxDurability) * 100;
    if (percentage > 0 && percentage <= 10 && ((currentDurability / maxDurability) * 100) > 10) {
      const itemData = ItemDatabase.getItem(item.itemId);
      const itemName = itemData?.name || 'Item';
      return `${itemName} is critically damaged!`;
    }
    
    return null;
  }
  
  // Get all broken equipment slots
  static getBrokenEquipment(player: PlayerData): Array<{ slot: string; itemId: string }> {
    const broken: Array<{ slot: string; itemId: string }> = [];
    
    const slots: Array<keyof typeof player.equipment> = [
      'mainHand', 'offHand', 'helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape'
    ];
    
    for (const slot of slots) {
      const equipped = player.equipment[slot];
      if (equipped && (equipped.durability ?? 100) <= 0) {
        broken.push({ slot, itemId: equipped.itemId });
      }
    }
    
    return broken;
  }
  
  // Auto-unequip broken items
  static unequipBrokenItems(player: PlayerData): string[] {
    const messages: string[] = [];
    const broken = this.getBrokenEquipment(player);
    
    for (const { slot, itemId } of broken) {
      const itemData = ItemDatabase.getItem(itemId);
      const itemName = itemData?.name || 'Item';
      player.equipment[slot as keyof typeof player.equipment] = undefined;
      messages.push(`${itemName} broke and was unequipped!`);
    }
    
    return messages;
  }
}
