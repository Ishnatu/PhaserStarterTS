/**
 * Server-side weapon attack validator
 * Prevents clients from forging weapon attacks with spoofed damage/costs
 * 
 * [SECURITY] This is critical anti-cheat infrastructure:
 * - Client sends only attack name (string)
 * - Server validates attack belongs to equipped weapon
 * - Server returns authoritative attack data with correct stats
 */

import type { PlayerData, PlayerEquipment, EquippedItem, WeaponAttack, WeaponData } from '../../shared/types';
import { ItemDatabase } from '../../src/config/ItemDatabase';
import { WeaponAttackDatabase } from '../../src/config/WeaponAttackDatabase';

export class WeaponValidator {
  /**
   * Validate and retrieve authoritative weapon attack
   * 
   * @param attackName - Attack name from client (e.g., "Quick Slash", "Pommel Strike")
   * @param player - Player data loaded from storage (server-authoritative)
   * @returns Authoritative WeaponAttack with correct costs/damage, or null if invalid
   */
  static validateAttack(attackName: string, player: PlayerData): WeaponAttack | null {
    const equipment = player.equipment;
    
    // Check mainhand weapon
    if (equipment.mainHand) {
      const mainHandAttack = this.getWeaponAttack(equipment.mainHand, attackName, 'mainHand');
      if (mainHandAttack) {
        return mainHandAttack;
      }
    }
    
    // Check offhand weapon
    if (equipment.offHand) {
      const offHandAttack = this.getWeaponAttack(equipment.offHand, attackName, 'offHand');
      if (offHandAttack) {
        return offHandAttack;
      }
    }
    
    // Attack not found in any equipped weapon
    return null;
  }

  /**
   * Get weapon attack from equipped item
   */
  private static getWeaponAttack(
    equippedItem: EquippedItem, 
    attackName: string, 
    sourceHand: 'mainHand' | 'offHand'
  ): WeaponAttack | null {
    // Load weapon data from authoritative ItemDatabase
    const weaponData = ItemDatabase.getWeapon(equippedItem.itemId);
    if (!weaponData) {
      return null;
    }

    // Get all attacks for this weapon type from WeaponAttackDatabase
    const attacks = WeaponAttackDatabase.getAttacksForWeapon(weaponData.type);

    // Find the specific attack by name
    const attack = attacks.find((a: WeaponAttack) => a.name === attackName);
    if (!attack) {
      return null;
    }

    // Return authoritative attack with weapon data
    return {
      ...attack,
      sourceHand,
      weaponData,
      enhancementLevel: equippedItem.enhancementLevel || 0
    };
  }

  /**
   * Get all available attacks for player's equipped weapons
   * Used for validation and UI display
   */
  static getAvailableAttacks(player: PlayerData): WeaponAttack[] {
    const attacks: WeaponAttack[] = [];
    const equipment = player.equipment;

    // Get mainhand attacks
    if (equipment.mainHand) {
      const mainHandAttacks = this.getWeaponAttacks(equipment.mainHand, 'mainHand');
      attacks.push(...mainHandAttacks);
    }

    // Get offhand attacks
    if (equipment.offHand) {
      const offHandAttacks = this.getWeaponAttacks(equipment.offHand, 'offHand');
      attacks.push(...offHandAttacks);
    }

    return attacks;
  }

  /**
   * Get all attacks for an equipped weapon
   */
  private static getWeaponAttacks(
    equippedItem: EquippedItem,
    sourceHand: 'mainHand' | 'offHand'
  ): WeaponAttack[] {
    const weaponData = ItemDatabase.getWeapon(equippedItem.itemId);
    if (!weaponData) {
      return [];
    }

    const attacks = WeaponAttackDatabase.getAttacksForWeapon(weaponData.type);

    // Add weapon data and source hand to each attack
    return attacks.map((attack: WeaponAttack) => ({
      ...attack,
      sourceHand,
      weaponData,
      enhancementLevel: equippedItem.enhancementLevel || 0
    }));
  }

  /**
   * Validate if player has enough resources for an attack
   */
  static canAffordAttack(attack: WeaponAttack, player: PlayerData): {
    canAfford: boolean;
    reason?: string;
  } {
    // Check stamina
    if (player.stamina < attack.staminaCost) {
      return {
        canAfford: false,
        reason: `Insufficient stamina (need ${attack.staminaCost}, have ${player.stamina})`
      };
    }

    // Check action points (in combat state, not stored in player)
    // This will be validated by CombatSystem

    return { canAfford: true };
  }
}
