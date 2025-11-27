/**
 * Security Monitor - Comprehensive logging, monitoring, and anti-cheat system
 * 
 * Features:
 * - Security event logging with severity levels
 * - Behavior anomaly detection
 * - Request fingerprinting for replay attack prevention
 * - Rate limiting enhancement
 * - Suspicious activity tracking
 */

import crypto from 'crypto';

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  playerId: string | null;
  ip: string;
  userAgent: string;
  eventType: string;
  severity: SecuritySeverity;
  details: Record<string, any>;
  requestId: string;
}

export interface PlayerBehaviorProfile {
  playerId: string;
  lastSeen: Date;
  requestCount: number;
  suspiciousActions: number;
  lastKnownIP: string;
  lastKnownUserAgent: string;
  recentActions: { action: string; timestamp: Date }[];
}

const securityEvents: SecurityEvent[] = [];
const playerProfiles: Map<string, PlayerBehaviorProfile> = new Map();
const requestNonces: Map<string, Date> = new Map();
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_EVENTS = 10000; // Keep last 10k events in memory
const MAX_RECENT_ACTIONS = 50;

// Suspicious behavior thresholds
const THRESHOLDS = {
  requestsPerMinute: 120, // More than 2 per second is suspicious
  saveFrequency: 5000, // Saves faster than 5 seconds apart
  currencyGainRate: 1000, // AA per minute (impossibly high)
  xpGainRate: 500, // XP per minute (impossibly high)
  combatActionsPerSecond: 5, // More than 5 actions per second
};

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a nonce for replay attack prevention
 */
export function generateNonce(): string {
  const nonce = crypto.randomBytes(32).toString('hex');
  requestNonces.set(nonce, new Date());
  cleanExpiredNonces();
  return nonce;
}

/**
 * Validate and consume a nonce (prevents replay attacks)
 */
export function validateNonce(nonce: string): boolean {
  const timestamp = requestNonces.get(nonce);
  if (!timestamp) return false;
  
  const now = new Date();
  const age = now.getTime() - timestamp.getTime();
  
  // Nonce must be valid and not expired
  if (age > NONCE_EXPIRY_MS) {
    requestNonces.delete(nonce);
    return false;
  }
  
  // Consume the nonce (one-time use)
  requestNonces.delete(nonce);
  return true;
}

/**
 * Clean up expired nonces
 */
function cleanExpiredNonces(): void {
  const now = new Date().getTime();
  for (const [nonce, timestamp] of requestNonces.entries()) {
    if (now - timestamp.getTime() > NONCE_EXPIRY_MS) {
      requestNonces.delete(nonce);
    }
  }
}

/**
 * Log a security event
 */
export function logSecurityEvent(
  eventType: string,
  severity: SecuritySeverity,
  details: Record<string, any>,
  playerId: string | null = null,
  ip: string = 'unknown',
  userAgent: string = 'unknown',
  requestId: string = generateRequestId()
): SecurityEvent {
  const event: SecurityEvent = {
    id: generateRequestId(),
    timestamp: new Date(),
    playerId,
    ip,
    userAgent,
    eventType,
    severity,
    details,
    requestId,
  };
  
  securityEvents.push(event);
  
  // Trim old events
  while (securityEvents.length > MAX_EVENTS) {
    securityEvents.shift();
  }
  
  // Log to console with appropriate level
  const logMessage = `[SECURITY:${severity}] ${eventType} - Player: ${playerId || 'anonymous'} - ${JSON.stringify(details)}`;
  
  switch (severity) {
    case 'CRITICAL':
      console.error(logMessage);
      break;
    case 'HIGH':
      console.warn(logMessage);
      break;
    case 'MEDIUM':
      console.log(logMessage);
      break;
    case 'LOW':
      // Only log in debug mode
      if (process.env.DEBUG_SECURITY === 'true') {
        console.log(logMessage);
      }
      break;
  }
  
  return event;
}

/**
 * Track player behavior for anomaly detection
 */
export function trackPlayerAction(
  playerId: string,
  action: string,
  ip: string,
  userAgent: string
): { suspicious: boolean; reason?: string } {
  const now = new Date();
  let profile = playerProfiles.get(playerId);
  
  if (!profile) {
    profile = {
      playerId,
      lastSeen: now,
      requestCount: 0,
      suspiciousActions: 0,
      lastKnownIP: ip,
      lastKnownUserAgent: userAgent,
      recentActions: [],
    };
    playerProfiles.set(playerId, profile);
  }
  
  // Check for IP change (potential account sharing or hijack)
  if (profile.lastKnownIP !== ip && profile.lastKnownIP !== 'unknown') {
    logSecurityEvent('IP_CHANGE', 'MEDIUM', {
      oldIP: profile.lastKnownIP,
      newIP: ip,
      action,
    }, playerId, ip, userAgent);
  }
  
  // Check for user agent change
  if (profile.lastKnownUserAgent !== userAgent && profile.lastKnownUserAgent !== 'unknown') {
    logSecurityEvent('USER_AGENT_CHANGE', 'LOW', {
      oldUA: profile.lastKnownUserAgent,
      newUA: userAgent,
      action,
    }, playerId, ip, userAgent);
  }
  
  // Track this action
  profile.recentActions.push({ action, timestamp: now });
  while (profile.recentActions.length > MAX_RECENT_ACTIONS) {
    profile.recentActions.shift();
  }
  
  // Calculate request rate
  const oneMinuteAgo = new Date(now.getTime() - 60000);
  const recentCount = profile.recentActions.filter(a => a.timestamp > oneMinuteAgo).length;
  
  profile.requestCount = recentCount;
  profile.lastSeen = now;
  profile.lastKnownIP = ip;
  profile.lastKnownUserAgent = userAgent;
  
  // Check for suspicious behavior
  if (recentCount > THRESHOLDS.requestsPerMinute) {
    profile.suspiciousActions++;
    logSecurityEvent('RATE_ANOMALY', 'HIGH', {
      requestsPerMinute: recentCount,
      threshold: THRESHOLDS.requestsPerMinute,
      action,
    }, playerId, ip, userAgent);
    return { suspicious: true, reason: 'Excessive request rate' };
  }
  
  return { suspicious: false };
}

/**
 * Validate currency gain rate
 */
export function validateCurrencyGain(
  playerId: string,
  aaGained: number,
  caGained: number,
  ip: string,
  userAgent: string
): { valid: boolean; reason?: string } {
  const profile = playerProfiles.get(playerId);
  if (!profile) return { valid: true };
  
  // Check recent combat actions to see if currency gain is reasonable
  const oneMinuteAgo = new Date(Date.now() - 60000);
  const recentCombatActions = profile.recentActions.filter(
    a => a.action.includes('combat') && a.timestamp > oneMinuteAgo
  ).length;
  
  // Rough estimate: max 10 combats per minute, max 100 AA per combat at high tier
  const maxReasonableAA = recentCombatActions * 100 + 100; // Buffer
  
  if (aaGained > maxReasonableAA) {
    logSecurityEvent('CURRENCY_ANOMALY', 'HIGH', {
      aaGained,
      caGained,
      recentCombatActions,
      maxExpected: maxReasonableAA,
    }, playerId, ip, userAgent);
    return { valid: false, reason: 'Currency gain exceeds expected rate' };
  }
  
  return { valid: true };
}

/**
 * Check for combat manipulation
 */
export function validateCombatTiming(
  playerId: string,
  combatDurationMs: number,
  enemiesDefeated: number,
  ip: string,
  userAgent: string
): { valid: boolean; reason?: string } {
  // Minimum combat duration: 2 seconds per enemy (even with instant kills)
  const minDuration = enemiesDefeated * 2000;
  
  if (combatDurationMs < minDuration && enemiesDefeated > 0) {
    logSecurityEvent('COMBAT_TIMING_ANOMALY', 'HIGH', {
      combatDurationMs,
      enemiesDefeated,
      minExpected: minDuration,
    }, playerId, ip, userAgent);
    return { valid: false, reason: 'Combat completed impossibly fast' };
  }
  
  return { valid: true };
}

/**
 * Generate CSRF token
 */
export function generateCSRFToken(sessionId: string): string {
  const secret = process.env.SESSION_SECRET || 'default-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(sessionId + Date.now().toString())
    .digest('hex');
}

/**
 * Validate request fingerprint (helps detect automation)
 */
export function validateRequestFingerprint(
  ip: string,
  userAgent: string,
  acceptLanguage: string,
  acceptEncoding: string
): { suspicious: boolean; reason?: string } {
  // Check for missing or bot-like user agents
  if (!userAgent || userAgent.length < 10) {
    return { suspicious: true, reason: 'Missing or invalid user agent' };
  }
  
  // Common bot indicators
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /curl/i, /wget/i, /python/i, /java\//i,
    /headless/i, /phantom/i, /selenium/i,
  ];
  
  for (const pattern of botPatterns) {
    if (pattern.test(userAgent)) {
      return { suspicious: true, reason: `Bot-like user agent: ${pattern}` };
    }
  }
  
  // Missing typical browser headers
  if (!acceptLanguage || !acceptEncoding) {
    return { suspicious: true, reason: 'Missing standard browser headers' };
  }
  
  return { suspicious: false };
}

/**
 * Get security events for monitoring dashboard
 */
export function getRecentSecurityEvents(
  count: number = 100,
  severity?: SecuritySeverity,
  playerId?: string
): SecurityEvent[] {
  let filtered = securityEvents;
  
  if (severity) {
    filtered = filtered.filter(e => e.severity === severity);
  }
  
  if (playerId) {
    filtered = filtered.filter(e => e.playerId === playerId);
  }
  
  return filtered.slice(-count);
}

/**
 * Get player behavior profile for admin review
 */
export function getPlayerProfile(playerId: string): PlayerBehaviorProfile | null {
  return playerProfiles.get(playerId) || null;
}

/**
 * Get summary statistics for monitoring
 */
export function getSecurityStats(): {
  totalEvents: number;
  eventsBySeverity: Record<SecuritySeverity, number>;
  activePlayers: number;
  suspiciousPlayers: number;
} {
  const eventsBySeverity: Record<SecuritySeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  
  for (const event of securityEvents) {
    eventsBySeverity[event.severity]++;
  }
  
  const suspiciousPlayers = Array.from(playerProfiles.values())
    .filter(p => p.suspiciousActions > 0).length;
  
  return {
    totalEvents: securityEvents.length,
    eventsBySeverity,
    activePlayers: playerProfiles.size,
    suspiciousPlayers,
  };
}

/**
 * Express middleware for request tracking (applies AFTER body/session parsing)
 * Only logs suspicious activity - does not block requests
 */
export function securityMiddleware(req: any, res: any, next: () => void): void {
  const requestId = generateRequestId();
  req.securityRequestId = requestId;
  
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Only track authenticated user actions for game API routes
  // Skip fingerprint validation to avoid false positives
  if (req.user?.claims?.sub && req.path.startsWith('/api/game')) {
    const tracking = trackPlayerAction(req.user.claims.sub, req.path, ip, userAgent);
    if (tracking.suspicious) {
      logSecurityEvent('SUSPICIOUS_BEHAVIOR', 'HIGH', {
        reason: tracking.reason,
        path: req.path,
        method: req.method,
      }, req.user.claims.sub, ip, userAgent, requestId);
      // Note: We log but don't block - server-authoritative design handles exploits
    }
  }
  
  next();
}

/**
 * Validate admin access with proper checks
 */
export function validateAdminAccess(req: any): { valid: boolean; reason?: string } {
  const adminKey = req.headers['x-admin-key'];
  const configuredKey = process.env.ADMIN_KEY;
  
  // Admin key must be configured in environment
  if (!configuredKey || configuredKey.length < 32) {
    return { valid: false, reason: 'Admin access not configured' };
  }
  
  if (adminKey !== configuredKey) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS', 'HIGH', {
      path: req.path,
      ip,
    });
    return { valid: false, reason: 'Invalid admin key' };
  }
  
  return { valid: true };
}
