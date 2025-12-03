import { rateLimiter } from './rateLimiter';
import { validateSession, registerSession, invalidateSession } from './sessionGuard';
import type { RequestContext, PolicyDecision } from '../events/types';
import { securityEventBus } from '../events/eventBus';

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
