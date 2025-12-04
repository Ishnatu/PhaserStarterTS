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
const BASE_HEALTH = 110;
const MAX_STAMINA_PER_LEVEL = 20;
const BASE_STAMINA = 120;
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
  const isShiny = clientItem.isShiny === true;

  const canonicalItem: any = {
    itemId,
    name: baseItem.data.name,
    enhancementLevel,
    durability,
    maxDurability,
    soulbound,
    isShiny,
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
    canonicalItem.isShiny = clientItem.isShiny === true;

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
    // Changed from Set to array to properly count duplicates (e.g., dual-wielding same weapon type)
    equipmentItemIds: string[];
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
  
  const starterKitRemainingAllowance = isNewPlayerWithStarterKit 
    ? getStarterKitItemCounts() 
    : new Map<string, number>();

  const currentTotalItemCounts = new Map<string, number>();
  
  if (player.equipment && typeof player.equipment === 'object') {
    for (const slot of Object.keys(player.equipment)) {
      const item = player.equipment[slot];
      if (item?.itemId) {
        currentTotalItemCounts.set(item.itemId, (currentTotalItemCounts.get(item.itemId) || 0) + 1);
      }
    }
  }
  
  if (Array.isArray(player.inventory)) {
    for (const item of player.inventory) {
      if (item?.itemId) {
        currentTotalItemCounts.set(item.itemId, (currentTotalItemCounts.get(item.itemId) || 0) + 1);
      }
    }
  }
  
  if (Array.isArray(player.footlocker)) {
    for (const item of player.footlocker) {
      if (item?.itemId) {
        currentTotalItemCounts.set(item.itemId, (currentTotalItemCounts.get(item.itemId) || 0) + 1);
      }
    }
  }

  const previousTotalItemCounts = new Map<string, number>();
  previousItems.equipmentItemIds.forEach(id => {
    previousTotalItemCounts.set(id, (previousTotalItemCounts.get(id) || 0) + 1);
  });
  previousItems.inventoryItemIds.forEach(id => {
    previousTotalItemCounts.set(id, (previousTotalItemCounts.get(id) || 0) + 1);
  });
  previousItems.footlockerItemIds.forEach(id => {
    previousTotalItemCounts.set(id, (previousTotalItemCounts.get(id) || 0) + 1);
  });

  const mintedItems: string[] = [];

  for (const [itemId, currentCount] of currentTotalItemCounts) {
    const previousCount = previousTotalItemCounts.get(itemId) || 0;
    const newItemCount = currentCount - previousCount;

    if (newItemCount <= 0) {
      continue;
    }

    if (isNewPlayerWithStarterKit && STARTER_KIT_ITEM_IDS.has(itemId)) {
      const remaining = starterKitRemainingAllowance.get(itemId) || 0;
      if (newItemCount <= remaining) {
        starterKitRemainingAllowance.set(itemId, remaining - newItemCount);
        continue;
      } else {
        const exceededBy = newItemCount - remaining;
        starterKitRemainingAllowance.set(itemId, 0);
        for (let i = 0; i < exceededBy; i++) {
          mintedItems.push(itemId);
        }
        continue;
      }
    }

    for (let i = 0; i < newItemCount; i++) {
      mintedItems.push(itemId);
    }
  }

  if (mintedItems.length > 0) {
    logSecurityEvent(playerId, 'ITEM_MINTING_DETECTED', 'CRITICAL', {
      mintedItems,
      message: 'Player attempted to add items that were never legitimately obtained'
    });
    errors.push(`Unauthorized items detected: ${mintedItems.join(', ')}`);
  }

  return { errors, warnings };
}

export interface PreviousItemData {
  // Changed from Set to array to properly count duplicates (e.g., dual-wielding same weapon type)
  equipmentItemIds: string[];
  inventoryItemIds: string[];
  footlockerItemIds: string[];
}

export function validateSavePayload(
  saveData: any, 
  playerId: string = 'unknown',
  previousItems?: PreviousItemData,
  serverAuthoritativeHasReceivedStarterKit: boolean = false
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!saveData || typeof saveData !== 'object') {
    return { valid: false, errors: ['Invalid save data structure'] };
  }

  if (!saveData.player || typeof saveData.player !== 'object') {
    return { valid: false, errors: ['Missing player data'] };
  }

  // Silently strip forbidden fields - this is expected behavior, not a security concern.
  // The client naturally includes these fields (stats, level, etc.) in its save payload,
  // and the server correctly ignores them since they're calculated server-side.
  // No need to log this as it happens on every save and creates unnecessary noise.

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
  // NOTE: hasReceivedStarterKit MUST come from server-authoritative source (previous save),
  // NOT from client input, to prevent spoofing attacks
  if (previousItems) {
    const mintingResult = validateItemReconciliation(
      sanitized.player,
      previousItems,
      playerId,
      serverAuthoritativeHasReceivedStarterKit
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

export function recalculatePlayerStats(equipment: PlayerEquipment, level: number = 1): PlayerStats {
  return calculatePlayerStats(equipment, level);
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
  
  enforced.player.stats = recalculatePlayerStats(enforced.player.equipment || {}, serverState.level);
  
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

/**
 * ============================================================================
 * XSS PREVENTION - INPUT SANITIZATION
 * ============================================================================
 * 
 * Sanitizes user-generated content to prevent XSS attacks.
 * All user input (usernames, etc.) should be sanitized before storage.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

const HTML_ESCAPE_REGEX = /[&<>"'`=/]/g;

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitize username - removes dangerous characters and limits length
 * Usernames should only contain alphanumeric, underscore, dash
 */
export function sanitizeUsername(username: string): string {
  if (typeof username !== 'string') return 'player';
  
  // Remove any HTML/script tags first
  let sanitized = username.replace(/<[^>]*>/g, '');
  
  // Allow only alphanumeric, underscore, dash, space
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\- ]/g, '');
  
  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Limit length
  sanitized = sanitized.substring(0, 32);
  
  // Fallback if empty
  if (!sanitized || sanitized.length === 0) {
    return 'player';
  }
  
  return sanitized;
}

/**
 * Validate and sanitize any user-provided text for display
 * This should be used for any text that might be displayed in UI
 */
export function sanitizeDisplayText(text: string, maxLength: number = 100): string {
  if (typeof text !== 'string') return '';
  
  // Escape HTML entities
  let sanitized = escapeHtml(text);
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Limit length
  sanitized = sanitized.substring(0, maxLength);
  
  return sanitized;
}
