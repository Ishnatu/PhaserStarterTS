import { rateLimiter } from './rateLimiter';
import { validateSession, registerSession, invalidateSession, isSessionValid } from './sessionGuard';
import type { RequestContext, PolicyDecision } from '../events/types';
import { securityEventBus } from '../events/eventBus';
import type { InventoryItem, EquippedItem } from '../../../shared/types';

const tempBans = new Map<string, number>();

export function performInlineChecks(context: RequestContext): PolicyDecision {
  const { playerId, endpoint, ip } = context;

  const banExpiry = tempBans.get(playerId);
  if (banExpiry && Date.now() < banExpiry) {
    return { 
      allow: false, 
      reason: 'Temporarily banned for suspicious activity' 
    };
  }

  const rateResult = rateLimiter.check(playerId, endpoint);
  if (!rateResult.allowed) {
    securityEventBus.emitQuick(playerId, 'RATE_LIMIT_EXCEEDED', 'MEDIUM', {
      endpoint,
      remaining: rateResult.remaining,
    }, ip, endpoint);
    
    return { 
      allow: false, 
      reason: 'Rate limit exceeded',
      actions: [{ type: 'RATE_LIMIT', durationMs: rateResult.resetTime - Date.now() }]
    };
  }

  return { allow: true };
}

export function validatePlayerSession(playerId: string, sessionId: string | undefined): PolicyDecision {
  if (!sessionId) {
    return { allow: false, reason: 'No session provided' };
  }
  
  const sessionResult = validateSession(playerId, sessionId);
  if (!sessionResult.valid) {
    return { 
      allow: false, 
      reason: sessionResult.error || 'Invalid session' 
    };
  }
  
  return { allow: true };
}

export function reconstructCanonicalInventoryItem(item: any): InventoryItem | null {
  if (!item || typeof item !== 'object') return null;
  
  const validSlots = ['weapon', 'offhand', 'armor', 'helmet', 'boots', 'gloves', 'accessory1', 'accessory2', 'consumable'];
  if (!item.id || !item.name || !validSlots.includes(item.slot)) {
    return null;
  }

  return {
    id: String(item.id),
    name: String(item.name),
    slot: item.slot,
    tier: Math.max(1, Math.min(10, Number(item.tier) || 1)),
    enhancement: Math.max(0, Math.min(9, Number(item.enhancement) || 0)),
    rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(item.rarity) ? item.rarity : 'common',
    stats: item.stats && typeof item.stats === 'object' ? { ...item.stats } : {},
    isShiny: Boolean(item.isShiny),
  };
}

export function reconstructCanonicalEquipmentItem(item: any): EquippedItem | null {
  if (!item || typeof item !== 'object') return null;
  
  const validSlots = ['weapon', 'offhand', 'armor', 'helmet', 'boots', 'gloves', 'accessory1', 'accessory2'];
  if (!item.id || !item.name || !validSlots.includes(item.slot)) {
    return null;
  }

  return {
    id: String(item.id),
    name: String(item.name),
    slot: item.slot,
    tier: Math.max(1, Math.min(10, Number(item.tier) || 1)),
    enhancement: Math.max(0, Math.min(9, Number(item.enhancement) || 0)),
    rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(item.rarity) ? item.rarity : 'common',
    stats: item.stats && typeof item.stats === 'object' ? { ...item.stats } : {},
    isShiny: Boolean(item.isShiny),
    isSoulbound: Boolean(item.isSoulbound),
    durability: typeof item.durability === 'number' ? Math.max(0, Math.min(100, item.durability)) : 100,
  };
}

export function addTempBan(playerId: string, durationMs: number): void {
  tempBans.set(playerId, Date.now() + durationMs);
}

export function removeTempBan(playerId: string): void {
  tempBans.delete(playerId);
}

export function isBanned(playerId: string): boolean {
  const expiry = tempBans.get(playerId);
  if (!expiry) return false;
  if (Date.now() >= expiry) {
    tempBans.delete(playerId);
    return false;
  }
  return true;
}

export { rateLimiter, validateSession, registerSession, invalidateSession };

export * from './rateLimiter';
export * from './sessionGuard';
