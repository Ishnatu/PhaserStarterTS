import { securityEventBus } from './events/eventBus';
import { initializeTier2Processors } from './tier2';
import { startBackgroundJobs } from './tier3/scheduler';
import { getSecuritySystemStats } from './tier3/memoryCompactor';
import { performInlineChecks, rateLimiter, registerSession } from './tier1';
import * as policyEngine from './policyEngine';
import type { RequestContext, SecuritySeverity } from './events/types';
import type { Request, Response, NextFunction } from 'express';

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

export function lightweightSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isAdminRoute = req.path.startsWith('/api/admin');
  const isPublicRoute = req.path === '/api/auth/user' || req.path === '/api/health';
  const user = (req as any).user;
  
  if (isPublicRoute) {
    return next();
  }
  
  const playerId = user?.claims?.sub;
  
  if (!playerId) {
    return next();
  }
  
  const context: RequestContext = {
    playerId,
    endpoint: req.path,
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.get('user-agent'),
    timestamp: Date.now(),
  };
  
  const result = checkRequest(context);
  
  if (!result.allowed) {
    res.status(429).json({ 
      success: false, 
      message: result.reason || 'Request blocked by security policy' 
    });
    return;
  }
  
  next();
}

export function registerPlayerSession(playerId: string, sessionId: string): void {
  registerSession(sessionId, playerId);
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
export { rateLimiter, validatePlayerSession, reconstructCanonicalInventoryItem, reconstructCanonicalEquipmentItem } from './tier1';
