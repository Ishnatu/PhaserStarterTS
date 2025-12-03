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
  
  if (!item.itemId) {
    return null;
  }

  return {
    itemId: String(item.itemId),
    quantity: Math.max(1, Number(item.quantity) || 1),
    enhancementLevel: typeof item.enhancementLevel === 'number' 
      ? Math.max(0, Math.min(9, item.enhancementLevel)) 
      : undefined,
    durability: typeof item.durability === 'number' 
      ? Math.max(0, Math.min(100, item.durability)) 
      : undefined,
    maxDurability: typeof item.maxDurability === 'number' 
      ? Math.max(0, Math.min(100, item.maxDurability)) 
      : undefined,
    isShiny: item.isShiny === true ? true : undefined,
  };
}

export function reconstructCanonicalEquipmentItem(item: any): EquippedItem | null {
  if (!item || typeof item !== 'object') return null;
  
  if (!item.itemId) {
    return null;
  }

  return {
    itemId: String(item.itemId),
    enhancementLevel: typeof item.enhancementLevel === 'number' 
      ? Math.max(0, Math.min(9, item.enhancementLevel)) 
      : undefined,
    durability: typeof item.durability === 'number' 
      ? Math.max(0, Math.min(100, item.durability)) 
      : undefined,
    maxDurability: typeof item.maxDurability === 'number' 
      ? Math.max(0, Math.min(100, item.maxDurability)) 
      : undefined,
    isShiny: item.isShiny === true ? true : undefined,
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
