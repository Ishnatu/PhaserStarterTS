import { securityEventBus } from './events/eventBus';
import { initializeTier2Processors } from './tier2';
import { startBackgroundJobs } from './tier3/scheduler';
import { getSecuritySystemStats } from './tier3/memoryCompactor';
import { performInlineChecks, rateLimiter } from './tier1';
import * as policyEngine from './policyEngine';
import type { RequestContext, SecuritySeverity } from './events/types';

let initialized = false;

export function initializeSecuritySystem(): void {
  if (initialized) return;

  securityEventBus.start();
  initializeTier2Processors();
  startBackgroundJobs();
  
  initialized = true;
  console.log('[Security] Tiered anti-cheat system initialized');
}

export function checkRequest(context: RequestContext): { allowed: boolean; reason?: string } {
  const policyResult = policyEngine.evaluate(context);
  if (!policyResult.allow) {
    return { allowed: false, reason: policyResult.reason };
  }

  const inlineResult = performInlineChecks(context);
  if (!inlineResult.allow) {
    return { allowed: false, reason: inlineResult.reason };
  }

  return { allowed: true };
}

export function emitSecurityEvent(
  playerId: string,
  eventType: string,
  severity: SecuritySeverity,
  data: Record<string, any> = {},
  ip?: string,
  endpoint?: string
): void {
  securityEventBus.emitQuick(playerId, eventType, severity, data, ip, endpoint);
}

export function recordSecurityViolation(playerId: string): void {
  policyEngine.recordViolation(playerId);
}

export { getSecuritySystemStats };
export * from './events/types';
export { rateLimiter } from './tier1';
