import { calculatePlayerStats, getAllValidItemIds, getWeapon, getArmor, getPotion } from '../shared/itemData';
import type { PlayerEquipment, InventoryItem, PlayerStats } from '../shared/types';

const FORBIDDEN_SAVE_FIELDS = [
  'stats',
  'level', 
  'experience',
  'maxHealth',
  'maxStamina',
  'arcaneAsh',
  'crystallineAnimus',
];

const MAX_LEVEL = 50;
const MAX_HEALTH_PER_LEVEL = 10;
const BASE_HEALTH = 100;
const MAX_STAMINA_PER_LEVEL = 5;
const BASE_STAMINA = 50;
const MAX_INVENTORY_SLOTS = 15;
const MAX_FOOTLOCKER_SLOTS = 80;
const MAX_ENHANCEMENT_LEVEL = 9;
const MAX_ITEM_DURABILITY = 200;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedData?: any;
}

export function validateSavePayload(saveData: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!saveData || typeof saveData !== 'object') {
    return { valid: false, errors: ['Invalid save data structure'] };
  }

  if (!saveData.player || typeof saveData.player !== 'object') {
    return { valid: false, errors: ['Missing player data'] };
  }

  // Note: We don't reject for forbidden fields - we sanitize them out
  // This is because the load endpoint injects these fields, so clients will have them
  // We just log when clients attempt to submit them (potential tampering indicator)
  for (const field of FORBIDDEN_SAVE_FIELDS) {
    if (saveData[field] !== undefined) {
      warnings.push(`Stripped forbidden field from root: ${field}`);
    }
    if (saveData.player[field] !== undefined) {
      warnings.push(`Stripped forbidden field from player: ${field}`);
    }
  }

  // Log warnings but don't fail validation
  if (warnings.length > 0) {
    console.log('[SECURITY] Save payload contained server-managed fields (will be stripped):', warnings);
  }

  // Sanitize the data (removes forbidden fields)
  const sanitized = sanitizeSaveData(saveData);
  
  // Validate remaining data
  const itemValidation = validateInventoryItems(sanitized.player);
  if (!itemValidation.valid) {
    errors.push(...itemValidation.errors);
  }

  const equipmentValidation = validateEquipment(sanitized.player.equipment);
  if (!equipmentValidation.valid) {
    errors.push(...equipmentValidation.errors);
  }

  if (sanitized.player.health !== undefined) {
    if (typeof sanitized.player.health !== 'number' || sanitized.player.health < 0) {
      errors.push('Invalid health value');
    }
  }

  if (sanitized.player.stamina !== undefined) {
    if (typeof sanitized.player.stamina !== 'number' || sanitized.player.stamina < 0) {
      errors.push('Invalid stamina value');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedData: errors.length === 0 ? sanitized : undefined
  };
}

function sanitizeSaveData(saveData: any): any {
  const sanitized = JSON.parse(JSON.stringify(saveData));
  
  for (const field of FORBIDDEN_SAVE_FIELDS) {
    delete sanitized[field];
    if (sanitized.player) {
      delete sanitized.player[field];
    }
  }

  return sanitized;
}

function validateInventoryItems(player: any): ValidationResult {
  const errors: string[] = [];
  const validItemIds = getAllValidItemIds();

  if (player.inventory && Array.isArray(player.inventory)) {
    if (player.inventory.length > MAX_INVENTORY_SLOTS) {
      errors.push(`Inventory exceeds max slots (${MAX_INVENTORY_SLOTS})`);
    }

    for (const item of player.inventory) {
      if (!validItemIds.has(item.itemId)) {
        errors.push(`Invalid item ID in inventory: ${item.itemId}`);
      }
      if (item.enhancementLevel !== undefined && 
          (item.enhancementLevel < 0 || item.enhancementLevel > MAX_ENHANCEMENT_LEVEL)) {
        errors.push(`Invalid enhancement level for ${item.itemId}: ${item.enhancementLevel}`);
      }
      if (item.durability !== undefined && 
          (item.durability < 0 || item.durability > MAX_ITEM_DURABILITY)) {
        errors.push(`Invalid durability for ${item.itemId}: ${item.durability}`);
      }
      if (item.quantity !== undefined && (item.quantity < 0 || item.quantity > 99)) {
        errors.push(`Invalid quantity for ${item.itemId}: ${item.quantity}`);
      }
    }
  }

  if (player.footlocker && Array.isArray(player.footlocker)) {
    if (player.footlocker.length > MAX_FOOTLOCKER_SLOTS) {
      errors.push(`Footlocker exceeds max slots (${MAX_FOOTLOCKER_SLOTS})`);
    }

    for (const item of player.footlocker) {
      if (!validItemIds.has(item.itemId)) {
        errors.push(`Invalid item ID in footlocker: ${item.itemId}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateEquipment(equipment: any): ValidationResult {
  const errors: string[] = [];
  
  if (!equipment || typeof equipment !== 'object') {
    return { valid: true, errors: [] };
  }

  const validItemIds = getAllValidItemIds();
  const VALID_EQUIPMENT_SLOTS = new Set(['mainHand', 'offHand', 'helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape']);

  for (const [slot, equipped] of Object.entries(equipment)) {
    if (!equipped || typeof equipped !== 'object') continue;
    
    if (!VALID_EQUIPMENT_SLOTS.has(slot)) {
      errors.push(`Invalid equipment slot: ${slot}`);
      continue;
    }
    
    const item = equipped as any;
    if (!item.itemId || !validItemIds.has(item.itemId)) {
      errors.push(`Invalid item in ${slot}: ${item.itemId}`);
    }
    if (item.enhancementLevel !== undefined && 
        (item.enhancementLevel < 0 || item.enhancementLevel > MAX_ENHANCEMENT_LEVEL)) {
      errors.push(`Invalid enhancement in ${slot}: ${item.enhancementLevel}`);
    }
    if (item.durability !== undefined && 
        (item.durability < 0 || item.durability > MAX_ITEM_DURABILITY)) {
      errors.push(`Invalid durability in ${slot}: ${item.durability}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function recalculatePlayerStats(equipment: PlayerEquipment): PlayerStats {
  return calculatePlayerStats(equipment);
}

export function calculateMaxHealth(level: number): number {
  const clampedLevel = Math.min(Math.max(1, level), MAX_LEVEL);
  return BASE_HEALTH + (clampedLevel - 1) * MAX_HEALTH_PER_LEVEL;
}

export function calculateMaxStamina(level: number): number {
  const clampedLevel = Math.min(Math.max(1, level), MAX_LEVEL);
  return BASE_STAMINA + (clampedLevel - 1) * MAX_STAMINA_PER_LEVEL;
}

export function calculateXPForLevel(level: number): number {
  return level * 100;
}

export function enforceServerAuthoritativeValues(
  saveData: any,
  serverState: {
    level: number;
    experience: number;
    arcaneAsh: number;
    crystallineAnimus: number;
  }
): any {
  const enforced = JSON.parse(JSON.stringify(saveData));
  
  enforced.player.level = serverState.level;
  enforced.player.experience = serverState.experience;
  enforced.player.arcaneAsh = serverState.arcaneAsh;
  enforced.player.crystallineAnimus = serverState.crystallineAnimus;
  
  enforced.player.maxHealth = calculateMaxHealth(serverState.level);
  enforced.player.maxStamina = calculateMaxStamina(serverState.level);
  
  if (enforced.player.health > enforced.player.maxHealth) {
    enforced.player.health = enforced.player.maxHealth;
  }
  if (enforced.player.stamina > enforced.player.maxStamina) {
    enforced.player.stamina = enforced.player.maxStamina;
  }
  
  enforced.player.stats = recalculatePlayerStats(enforced.player.equipment || {});
  
  return enforced;
}

export function validateExploredTiles(tiles: string[], maxTiles: number = 10000): string[] {
  if (!Array.isArray(tiles)) return [];
  
  const validTiles = tiles.filter(tile => {
    if (typeof tile !== 'string') return false;
    const parts = tile.split(',');
    if (parts.length !== 2) return false;
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    return !isNaN(x) && !isNaN(y) && x >= 0 && y >= 0 && x < 1000 && y < 1000;
  });

  return validTiles.slice(0, maxTiles);
}

export function logSecurityEvent(
  playerId: string,
  eventType: string,
  details: any
): void {
  console.warn(`[SECURITY] Player ${playerId}: ${eventType}`, JSON.stringify(details));
}
