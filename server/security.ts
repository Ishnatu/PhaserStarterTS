import { calculatePlayerStats, getAllValidItemIds, getWeapon, getArmor, getPotion, initializeItemData } from '../shared/itemData';
import type { PlayerEquipment, InventoryItem, PlayerStats, EquippedItem } from '../shared/types';
import { STARTER_KIT_ITEM_IDS, getStarterKitItemCounts } from '../shared/starterKit';

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
const BASE_STAMINA = 100;
const MAX_INVENTORY_SLOTS = 15;
const MAX_FOOTLOCKER_SLOTS = 80;
const MAX_ENHANCEMENT_LEVEL = 9;
const MAX_ITEM_DURABILITY = 200;
const BASE_ITEM_DURABILITY = 100;

const VALID_EQUIPMENT_SLOTS = new Set(['mainHand', 'offHand', 'helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape']);

const SLOT_COMPATIBILITY: Record<string, string[]> = {
  mainHand: ['weapon'],
  offHand: ['weapon', 'shield'],
  helmet: ['helmet'],
  chest: ['chest'],
  legs: ['legs'],
  boots: ['boots'],
  shoulders: ['shoulders'],
  cape: ['cape'],
};

const ITEM_ID_REGEX = /^[a-z0-9_]+$/i;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  sanitizedData?: any;
}

export interface SecurityEvent {
  playerId: string;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: any;
  timestamp: Date;
}

function isValidItemIdFormat(itemId: any): boolean {
  if (typeof itemId !== 'string') return false;
  if (itemId.length === 0 || itemId.length > 50) return false;
  return ITEM_ID_REGEX.test(itemId);
}

function getBaseItemData(itemId: string): { 
  type: 'weapon' | 'armor' | 'potion' | null;
  data: any;
  compatibleSlots: string[];
} {
  initializeItemData();
  
  const weapon = getWeapon(itemId);
  if (weapon) {
    return { 
      type: 'weapon', 
      data: weapon, 
      compatibleSlots: weapon.twoHanded ? ['mainHand'] : ['mainHand', 'offHand']
    };
  }
  
  const armor = getArmor(itemId);
  if (armor) {
    let compatibleSlots: string[] = [];
    if (armor.slot === 'shield') {
      compatibleSlots = ['offHand'];
    } else {
      compatibleSlots = [armor.slot];
    }
    return { type: 'armor', data: armor, compatibleSlots };
  }
  
  const potion = getPotion(itemId);
  if (potion) {
    return { type: 'potion', data: potion, compatibleSlots: [] };
  }
  
  return { type: null, data: null, compatibleSlots: [] };
}

function reconstructCanonicalEquipmentItem(
  clientItem: any, 
  equipmentSlot: string,
  context: string
): { 
  item: EquippedItem | null;
  error: string | null;
  warning: string | null;
} {
  if (!clientItem || typeof clientItem !== 'object') {
    return { item: null, error: `${context}: Item is not an object`, warning: null };
  }

  const itemId = clientItem.itemId;
  
  if (!isValidItemIdFormat(itemId)) {
    return { 
      item: null, 
      error: `${context}: Invalid itemId format (potential XSS): ${String(itemId).slice(0, 50)}`, 
      warning: null 
    };
  }

  const validItemIds = getAllValidItemIds();
  if (!validItemIds.has(itemId)) {
    return { 
      item: null, 
      error: `${context}: Unknown itemId: ${itemId}`, 
      warning: null 
    };
  }

  const baseItem = getBaseItemData(itemId);
  if (!baseItem.data) {
    return { 
      item: null, 
      error: `${context}: Could not load base data for ${itemId}`, 
      warning: null 
    };
  }

  if (baseItem.type === 'potion') {
    return {
      item: null,
      error: `${context}: Cannot equip potion ${itemId} in ${equipmentSlot}`,
      warning: null
    };
  }

  if (!baseItem.compatibleSlots.includes(equipmentSlot)) {
    return {
      item: null,
      error: `${context}: Item ${itemId} cannot be equipped in ${equipmentSlot} (valid slots: ${baseItem.compatibleSlots.join(', ')})`,
      warning: null
    };
  }

  let warning: string | null = null;

  let enhancementLevel = 0;
  if (typeof clientItem.enhancementLevel === 'number') {
    if (clientItem.enhancementLevel < 0 || clientItem.enhancementLevel > MAX_ENHANCEMENT_LEVEL) {
      warning = `${context}: Clamped invalid enhancement ${clientItem.enhancementLevel} for ${itemId}`;
      enhancementLevel = Math.max(0, Math.min(MAX_ENHANCEMENT_LEVEL, Math.floor(clientItem.enhancementLevel)));
    } else {
      enhancementLevel = Math.floor(clientItem.enhancementLevel);
    }
  }

  let durability = BASE_ITEM_DURABILITY;
  if (typeof clientItem.durability === 'number') {
    if (clientItem.durability < 0 || clientItem.durability > MAX_ITEM_DURABILITY) {
      warning = `${context}: Clamped invalid durability ${clientItem.durability} for ${itemId}`;
      durability = Math.max(0, Math.min(MAX_ITEM_DURABILITY, Math.floor(clientItem.durability)));
    } else {
      durability = Math.floor(clientItem.durability);
    }
  }

  let maxDurability = BASE_ITEM_DURABILITY;
  if (typeof clientItem.maxDurability === 'number' && clientItem.maxDurability >= 1) {
    maxDurability = Math.min(MAX_ITEM_DURABILITY, Math.floor(clientItem.maxDurability));
  }

  const soulbound = clientItem.soulbound === true;

  const canonicalItem: any = {
    itemId,
    name: baseItem.data.name,
    enhancementLevel,
    durability,
    maxDurability,
    soulbound,
    rarity: baseItem.data.rarity,
    description: baseItem.data.description,
  };

  if (baseItem.type === 'weapon') {
    canonicalItem.damage = { ...baseItem.data.damage };
    canonicalItem.type = baseItem.data.type;
    canonicalItem.twoHanded = baseItem.data.twoHanded;
  } else if (baseItem.type === 'armor') {
    canonicalItem.slot = baseItem.data.slot;
    canonicalItem.armorType = baseItem.data.armorType;
    canonicalItem.evasionModifier = baseItem.data.evasionModifier;
    canonicalItem.damageReduction = baseItem.data.damageReduction;
  }

  return { item: canonicalItem, error: null, warning };
}

function reconstructCanonicalInventoryItem(
  clientItem: any, 
  context: string
): { 
  item: InventoryItem | null;
  error: string | null;
  warning: string | null;
} {
  if (!clientItem || typeof clientItem !== 'object') {
    return { item: null, error: `${context}: Item is not an object`, warning: null };
  }

  const itemId = clientItem.itemId;
  
  if (!isValidItemIdFormat(itemId)) {
    return { 
      item: null, 
      error: `${context}: Invalid itemId format (potential XSS): ${String(itemId).slice(0, 50)}`, 
      warning: null 
    };
  }

  const validItemIds = getAllValidItemIds();
  if (!validItemIds.has(itemId)) {
    return { 
      item: null, 
      error: `${context}: Unknown itemId: ${itemId}`, 
      warning: null 
    };
  }

  const baseItem = getBaseItemData(itemId);
  if (!baseItem.data) {
    return { 
      item: null, 
      error: `${context}: Could not load base data for ${itemId}`, 
      warning: null 
    };
  }

  let warning: string | null = null;

  const canonicalItem: any = {
    itemId,
    name: baseItem.data.name,
    rarity: baseItem.data.rarity,
    description: baseItem.data.description,
    quantity: 1,
  };

  if (typeof clientItem.quantity === 'number' && clientItem.quantity >= 1 && clientItem.quantity <= 99) {
    canonicalItem.quantity = Math.floor(clientItem.quantity);
  }

  if (baseItem.type === 'weapon' || baseItem.type === 'armor') {
    let enhancementLevel = 0;
    if (typeof clientItem.enhancementLevel === 'number') {
      if (clientItem.enhancementLevel < 0 || clientItem.enhancementLevel > MAX_ENHANCEMENT_LEVEL) {
        warning = `${context}: Clamped invalid enhancement ${clientItem.enhancementLevel} for ${itemId}`;
        enhancementLevel = Math.max(0, Math.min(MAX_ENHANCEMENT_LEVEL, Math.floor(clientItem.enhancementLevel)));
      } else {
        enhancementLevel = Math.floor(clientItem.enhancementLevel);
      }
    }
    canonicalItem.enhancementLevel = enhancementLevel;

    let durability = BASE_ITEM_DURABILITY;
    if (typeof clientItem.durability === 'number') {
      if (clientItem.durability < 0 || clientItem.durability > MAX_ITEM_DURABILITY) {
        warning = `${context}: Clamped invalid durability ${clientItem.durability} for ${itemId}`;
        durability = Math.max(0, Math.min(MAX_ITEM_DURABILITY, Math.floor(clientItem.durability)));
      } else {
        durability = Math.floor(clientItem.durability);
      }
    }
    canonicalItem.durability = durability;

    let maxDurability = BASE_ITEM_DURABILITY;
    if (typeof clientItem.maxDurability === 'number' && clientItem.maxDurability >= 1) {
      maxDurability = Math.min(MAX_ITEM_DURABILITY, Math.floor(clientItem.maxDurability));
    }
    canonicalItem.maxDurability = maxDurability;

    canonicalItem.soulbound = clientItem.soulbound === true;

    if (baseItem.type === 'weapon') {
      canonicalItem.damage = { ...baseItem.data.damage };
      canonicalItem.type = baseItem.data.type;
      canonicalItem.twoHanded = baseItem.data.twoHanded;
    } else {
      canonicalItem.slot = baseItem.data.slot;
      canonicalItem.armorType = baseItem.data.armorType;
      canonicalItem.evasionModifier = baseItem.data.evasionModifier;
      canonicalItem.damageReduction = baseItem.data.damageReduction;
    }
  } else if (baseItem.type === 'potion') {
    canonicalItem.type = baseItem.data.type;
    canonicalItem.restoration = { ...baseItem.data.restoration };
  }

  return { item: canonicalItem, error: null, warning };
}

function reconstructCanonicalEquipment(clientEquipment: any, playerId: string): {
  equipment: PlayerEquipment;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const equipment: PlayerEquipment = {};

  if (!clientEquipment || typeof clientEquipment !== 'object') {
    return { equipment, errors, warnings };
  }

  for (const slot of VALID_EQUIPMENT_SLOTS) {
    const slotValue = clientEquipment[slot];
    
    if (slotValue === undefined) {
      continue;
    }
    
    if (slotValue === null) {
      logSecurityEvent(playerId, 'EQUIPMENT_NULL_ATTEMPT', 'HIGH', {
        slot,
        message: 'Client attempted to nullify equipment slot'
      });
      errors.push(`Cannot nullify equipment slot ${slot} via save - use unequip API`);
      continue;
    }

    const result = reconstructCanonicalEquipmentItem(slotValue, slot, `equipment.${slot}`);
    
    if (result.error) {
      logSecurityEvent(playerId, 'EQUIPMENT_INVALID_ITEM', 'HIGH', {
        slot,
        error: result.error,
        clientData: JSON.stringify(slotValue).slice(0, 200)
      });
      errors.push(result.error);
      continue;
    }

    if (result.warning) {
      logSecurityEvent(playerId, 'EQUIPMENT_VALUE_CLAMPED', 'MEDIUM', {
        slot,
        warning: result.warning
      });
      warnings.push(result.warning);
    }

    if (result.item) {
      (equipment as any)[slot] = result.item;
    }
  }

  for (const slot of Object.keys(clientEquipment)) {
    if (!VALID_EQUIPMENT_SLOTS.has(slot)) {
      logSecurityEvent(playerId, 'EQUIPMENT_INVALID_SLOT', 'HIGH', {
        slot,
        message: 'Client sent unknown equipment slot (stripped)',
        value: JSON.stringify(clientEquipment[slot]).slice(0, 100)
      });
      warnings.push(`Stripped unknown equipment slot: ${slot}`);
    }
  }

  return { equipment, errors, warnings };
}

function reconstructCanonicalInventory(clientInventory: any, playerId: string, containerName: string): {
  inventory: InventoryItem[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const inventory: InventoryItem[] = [];

  if (!Array.isArray(clientInventory)) {
    return { inventory, errors, warnings };
  }

  const maxSlots = containerName === 'footlocker' ? MAX_FOOTLOCKER_SLOTS : MAX_INVENTORY_SLOTS;
  
  if (clientInventory.length > maxSlots) {
    logSecurityEvent(playerId, 'INVENTORY_OVERFLOW', 'HIGH', {
      container: containerName,
      count: clientInventory.length,
      max: maxSlots
    });
    errors.push(`${containerName} exceeds max slots (${maxSlots})`);
    return { inventory, errors, warnings };
  }

  for (let i = 0; i < clientInventory.length; i++) {
    const clientItem = clientInventory[i];
    const result = reconstructCanonicalInventoryItem(clientItem, `${containerName}[${i}]`);

    if (result.error) {
      logSecurityEvent(playerId, 'INVENTORY_INVALID_ITEM', 'HIGH', {
        container: containerName,
        index: i,
        error: result.error,
        clientData: JSON.stringify(clientItem).slice(0, 200)
      });
      errors.push(result.error);
      continue;
    }

    if (result.warning) {
      logSecurityEvent(playerId, 'INVENTORY_VALUE_CLAMPED', 'MEDIUM', {
        container: containerName,
        index: i,
        warning: result.warning
      });
      warnings.push(result.warning);
    }

    if (result.item) {
      inventory.push(result.item);
    }
  }

  return { inventory, errors, warnings };
}

function validateItemReconciliation(
  player: any,
  previousItems: { 
    equipmentItemIds: Set<string>;
    inventoryItemIds: string[];
    footlockerItemIds: string[];
  },
  playerId: string,
  hasReceivedStarterKit: boolean = false
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const allPreviousItemIds = new Set<string>();
  previousItems.equipmentItemIds.forEach(id => allPreviousItemIds.add(id));
  previousItems.inventoryItemIds.forEach(id => allPreviousItemIds.add(id));
  previousItems.footlockerItemIds.forEach(id => allPreviousItemIds.add(id));

  const isNewPlayerWithStarterKit = hasReceivedStarterKit && allPreviousItemIds.size === 0;
  const starterKitCounts = isNewPlayerWithStarterKit ? getStarterKitItemCounts() : new Map<string, number>();

  const newItemsInEquipment: string[] = [];
  if (player.equipment && typeof player.equipment === 'object') {
    for (const slot of Object.keys(player.equipment)) {
      const item = player.equipment[slot];
      if (item?.itemId && !allPreviousItemIds.has(item.itemId)) {
        if (isNewPlayerWithStarterKit && STARTER_KIT_ITEM_IDS.has(item.itemId)) {
          continue;
        }
        newItemsInEquipment.push(item.itemId);
      }
    }
  }

  const newItemsInInventory: string[] = [];
  if (Array.isArray(player.inventory)) {
    const previousInvCount = new Map<string, number>();
    for (const id of previousItems.inventoryItemIds) {
      previousInvCount.set(id, (previousInvCount.get(id) || 0) + 1);
    }
    
    const currentInvCount = new Map<string, number>();
    for (const item of player.inventory) {
      if (item?.itemId) {
        currentInvCount.set(item.itemId, (currentInvCount.get(item.itemId) || 0) + 1);
      }
    }

    for (const [itemId, count] of currentInvCount) {
      const prevCount = previousInvCount.get(itemId) || 0;
      const equipmentHas = previousItems.equipmentItemIds.has(itemId);
      const footlockerHas = previousItems.footlockerItemIds.includes(itemId);
      
      if (count > prevCount && !equipmentHas && !footlockerHas) {
        if (!allPreviousItemIds.has(itemId)) {
          if (isNewPlayerWithStarterKit && STARTER_KIT_ITEM_IDS.has(itemId)) {
            const allowedCount = starterKitCounts.get(itemId) || 0;
            if (count <= allowedCount) {
              continue;
            }
          }
          newItemsInInventory.push(itemId);
        }
      }
    }
  }

  const newItemsInFootlocker: string[] = [];
  if (Array.isArray(player.footlocker)) {
    const previousFootCount = new Map<string, number>();
    for (const id of previousItems.footlockerItemIds) {
      previousFootCount.set(id, (previousFootCount.get(id) || 0) + 1);
    }
    
    const currentFootCount = new Map<string, number>();
    for (const item of player.footlocker) {
      if (item?.itemId) {
        currentFootCount.set(item.itemId, (currentFootCount.get(item.itemId) || 0) + 1);
      }
    }

    for (const [itemId, count] of currentFootCount) {
      const prevCount = previousFootCount.get(itemId) || 0;
      const wasInEquipmentOrInv = previousItems.equipmentItemIds.has(itemId) || 
                                   previousItems.inventoryItemIds.includes(itemId);
      
      if (count > prevCount && !wasInEquipmentOrInv) {
        if (!allPreviousItemIds.has(itemId)) {
          if (isNewPlayerWithStarterKit && STARTER_KIT_ITEM_IDS.has(itemId)) {
            const allowedCount = starterKitCounts.get(itemId) || 0;
            if (count <= allowedCount) {
              continue;
            }
          }
          newItemsInFootlocker.push(itemId);
        }
      }
    }
  }

  if (newItemsInEquipment.length > 0) {
    logSecurityEvent(playerId, 'ITEM_MINTING_EQUIPMENT', 'CRITICAL', {
      newItems: newItemsInEquipment,
      message: 'Player attempted to add items to equipment that were never obtained'
    });
    errors.push(`Unauthorized items in equipment: ${newItemsInEquipment.join(', ')}`);
  }

  if (newItemsInInventory.length > 0) {
    logSecurityEvent(playerId, 'ITEM_MINTING_INVENTORY', 'CRITICAL', {
      newItems: newItemsInInventory,
      message: 'Player attempted to add items to inventory that were never obtained'
    });
    errors.push(`Unauthorized items in inventory: ${newItemsInInventory.join(', ')}`);
  }

  if (newItemsInFootlocker.length > 0) {
    logSecurityEvent(playerId, 'ITEM_MINTING_FOOTLOCKER', 'CRITICAL', {
      newItems: newItemsInFootlocker,
      message: 'Player attempted to add items to footlocker that were never obtained'
    });
    errors.push(`Unauthorized items in footlocker: ${newItemsInFootlocker.join(', ')}`);
  }

  return { errors, warnings };
}

export interface PreviousItemData {
  equipmentItemIds: Set<string>;
  inventoryItemIds: string[];
  footlockerItemIds: string[];
}

export function validateSavePayload(
  saveData: any, 
  playerId: string = 'unknown',
  previousItems?: PreviousItemData
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!saveData || typeof saveData !== 'object') {
    return { valid: false, errors: ['Invalid save data structure'] };
  }

  if (!saveData.player || typeof saveData.player !== 'object') {
    return { valid: false, errors: ['Missing player data'] };
  }

  for (const field of FORBIDDEN_SAVE_FIELDS) {
    if (saveData[field] !== undefined) {
      warnings.push(`Stripped forbidden field from root: ${field}`);
    }
    if (saveData.player[field] !== undefined) {
      warnings.push(`Stripped forbidden field from player: ${field}`);
    }
  }

  if (warnings.length > 0) {
    logSecurityEvent(playerId, 'FORBIDDEN_FIELDS_STRIPPED', 'LOW', { fields: warnings });
  }

  const sanitized = sanitizeSaveData(saveData);

  const equipmentResult = reconstructCanonicalEquipment(sanitized.player.equipment, playerId);
  if (equipmentResult.errors.length > 0) {
    errors.push(...equipmentResult.errors);
  }
  warnings.push(...equipmentResult.warnings);
  sanitized.player.equipment = equipmentResult.equipment;

  const inventoryResult = reconstructCanonicalInventory(sanitized.player.inventory, playerId, 'inventory');
  if (inventoryResult.errors.length > 0) {
    errors.push(...inventoryResult.errors);
  }
  warnings.push(...inventoryResult.warnings);
  sanitized.player.inventory = inventoryResult.inventory;

  const footlockerResult = reconstructCanonicalInventory(sanitized.player.footlocker, playerId, 'footlocker');
  if (footlockerResult.errors.length > 0) {
    errors.push(...footlockerResult.errors);
  }
  warnings.push(...footlockerResult.warnings);
  sanitized.player.footlocker = footlockerResult.inventory;

  // SECURITY: Item minting prevention - validate items against previous server state
  if (previousItems) {
    const hasReceivedStarterKit = sanitized.player.hasReceivedStarterKit === true;
    const mintingResult = validateItemReconciliation(
      sanitized.player,
      previousItems,
      playerId,
      hasReceivedStarterKit
    );
    if (mintingResult.errors.length > 0) {
      errors.push(...mintingResult.errors);
    }
    warnings.push(...mintingResult.warnings);
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

  if (errors.length > 0) {
    logSecurityEvent(playerId, 'SAVE_VALIDATION_FAILED', 'HIGH', { 
      errorCount: errors.length,
      errors: errors.slice(0, 10)
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
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

const securityEventLog: SecurityEvent[] = [];
const MAX_LOG_SIZE = 1000;

export function logSecurityEvent(
  playerId: string,
  eventType: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  details: any
): void {
  const event: SecurityEvent = {
    playerId,
    eventType,
    severity,
    details,
    timestamp: new Date()
  };

  securityEventLog.push(event);
  if (securityEventLog.length > MAX_LOG_SIZE) {
    securityEventLog.shift();
  }

  const logLevel = severity === 'CRITICAL' || severity === 'HIGH' ? 'error' : 'warn';
  console[logLevel](`[SECURITY:${severity}] Player ${playerId}: ${eventType}`, JSON.stringify(details));
}

export function getRecentSecurityEvents(playerId?: string, limit: number = 50): SecurityEvent[] {
  let events = securityEventLog;
  if (playerId) {
    events = events.filter(e => e.playerId === playerId);
  }
  return events.slice(-limit);
}

export function getSecuritySummary(): {
  totalEvents: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
} {
  const bySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const byType: Record<string, number> = {};

  for (const event of securityEventLog) {
    bySeverity[event.severity]++;
    byType[event.eventType] = (byType[event.eventType] || 0) + 1;
  }

  return {
    totalEvents: securityEventLog.length,
    bySeverity,
    byType
  };
}
