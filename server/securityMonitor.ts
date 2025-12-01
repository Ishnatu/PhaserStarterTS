/**
 * Security Monitor - Comprehensive logging, monitoring, and anti-cheat system
 * 
 * Features:
 * - Security event logging with severity levels
 * - Behavior anomaly detection
 * - Request fingerprinting for replay attack prevention
 * - Rate limiting enhancement
 * - Suspicious activity tracking
 * - IP/ASN velocity tracking for Sybil attack detection (Phase 4 Security)
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
 * SECURITY: No fallback secret - SESSION_SECRET must be validated at server startup
 */
export function generateCSRFToken(sessionId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SECURITY FATAL: SESSION_SECRET not available for CSRF token generation');
  }
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
 * Includes anti-bot detection with activity and pattern tracking
 */
export function securityMiddleware(req: any, res: any, next: () => void): void {
  const requestId = generateRequestId();
  req.securityRequestId = requestId;
  
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Only track authenticated user actions for game API routes
  if (req.user?.claims?.sub && req.path.startsWith('/api/')) {
    const playerId = req.user.claims.sub;
    
    // Standard action tracking
    const tracking = trackPlayerAction(playerId, req.path, ip, userAgent);
    if (tracking.suspicious) {
      logSecurityEvent('SUSPICIOUS_BEHAVIOR', 'HIGH', {
        reason: tracking.reason,
        path: req.path,
        method: req.method,
      }, playerId, ip, userAgent, requestId);
    }
    
    // Anti-bot: 24h activity pattern tracking
    const activityCheck = trackActivityPattern(playerId, ip);
    if (activityCheck.suspicious) {
      req.botSuspicionReason = activityCheck.reason;
      
      // Create challenge if suspicion is high enough and no pending challenge exists
      if (activityCheck.requiresChallenge && !hasPendingChallenge(playerId)) {
        createInteractionChallenge(playerId);
      }
    }
    
    // Anti-bot: Action pattern tracking (for game actions only)
    if (req.path.startsWith('/api/game') || req.path.startsWith('/api/combat') || 
        req.path.startsWith('/api/loot') || req.path.startsWith('/api/delve')) {
      const patternCheck = trackActionPattern(playerId, req.path, ip);
      if (patternCheck.suspicious) {
        req.botSuspicionReason = patternCheck.reason;
      }
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

/**
 * ============================================================================
 * SYBIL ATTACK DETECTION - IP/ASN VELOCITY TRACKING
 * ============================================================================
 * 
 * Tracks account creation and login patterns per IP address to detect
 * multi-account farming operations.
 */

interface IPAccountTracker {
  ip: string;
  accountsCreated: { userId: string; timestamp: Date }[];
  accountsLoggedIn: { userId: string; timestamp: Date }[];
  firstSeen: Date;
  lastSeen: Date;
  flagged: boolean;
  flagReason?: string;
}

const ipAccountTrackers = new Map<string, IPAccountTracker>();

// Sybil detection thresholds
const SYBIL_THRESHOLDS = {
  maxAccountsPerIPPerDay: 3,      // More than 3 new accounts per IP per day is suspicious
  maxAccountsPerIPTotal: 10,      // More than 10 accounts from same IP ever is very suspicious
  maxLoginsPerIPPerHour: 5,       // More than 5 different accounts per hour per IP
  velocityWindowMs: 60 * 60 * 1000, // 1 hour window for velocity checks
  dailyWindowMs: 24 * 60 * 60 * 1000, // 24 hour window
};

/**
 * Track account creation from an IP address
 */
export function trackAccountCreation(
  ip: string,
  userId: string
): { suspicious: boolean; reason?: string; blocked: boolean } {
  const now = new Date();
  let tracker = ipAccountTrackers.get(ip);
  
  if (!tracker) {
    tracker = {
      ip,
      accountsCreated: [],
      accountsLoggedIn: [],
      firstSeen: now,
      lastSeen: now,
      flagged: false,
    };
    ipAccountTrackers.set(ip, tracker);
  }
  
  tracker.lastSeen = now;
  tracker.accountsCreated.push({ userId, timestamp: now });
  
  // Clean old entries
  const oneDayAgo = new Date(now.getTime() - SYBIL_THRESHOLDS.dailyWindowMs);
  tracker.accountsCreated = tracker.accountsCreated.filter(a => a.timestamp > oneDayAgo);
  
  // Check velocity
  const recentCreations = tracker.accountsCreated.length;
  
  if (recentCreations > SYBIL_THRESHOLDS.maxAccountsPerIPPerDay) {
    tracker.flagged = true;
    tracker.flagReason = `Too many accounts created: ${recentCreations} in 24h`;
    
    logSecurityEvent('SYBIL_ACCOUNT_VELOCITY', 'CRITICAL', {
      ip,
      userId,
      accountsInLast24h: recentCreations,
      threshold: SYBIL_THRESHOLDS.maxAccountsPerIPPerDay,
      allAccounts: tracker.accountsCreated.map(a => a.userId),
    });
    
    // Block after threshold
    if (recentCreations > SYBIL_THRESHOLDS.maxAccountsPerIPPerDay * 2) {
      return { 
        suspicious: true, 
        reason: 'Account creation blocked - too many accounts from this IP',
        blocked: true 
      };
    }
    
    return { 
      suspicious: true, 
      reason: `Suspicious account velocity: ${recentCreations} accounts from same IP`,
      blocked: false 
    };
  }
  
  return { suspicious: false, blocked: false };
}

/**
 * Track account login from an IP address
 */
export function trackAccountLogin(
  ip: string,
  userId: string
): { suspicious: boolean; reason?: string } {
  const now = new Date();
  let tracker = ipAccountTrackers.get(ip);
  
  if (!tracker) {
    tracker = {
      ip,
      accountsCreated: [],
      accountsLoggedIn: [],
      firstSeen: now,
      lastSeen: now,
      flagged: false,
    };
    ipAccountTrackers.set(ip, tracker);
  }
  
  tracker.lastSeen = now;
  tracker.accountsLoggedIn.push({ userId, timestamp: now });
  
  // Clean old entries
  const oneHourAgo = new Date(now.getTime() - SYBIL_THRESHOLDS.velocityWindowMs);
  tracker.accountsLoggedIn = tracker.accountsLoggedIn.filter(a => a.timestamp > oneHourAgo);
  
  // Count unique accounts in last hour
  const uniqueAccountsInHour = new Set(
    tracker.accountsLoggedIn.map(a => a.userId)
  ).size;
  
  if (uniqueAccountsInHour > SYBIL_THRESHOLDS.maxLoginsPerIPPerHour) {
    tracker.flagged = true;
    tracker.flagReason = `Too many account switches: ${uniqueAccountsInHour} in 1h`;
    
    logSecurityEvent('SYBIL_LOGIN_VELOCITY', 'HIGH', {
      ip,
      userId,
      uniqueAccountsInHour,
      threshold: SYBIL_THRESHOLDS.maxLoginsPerIPPerHour,
      allAccounts: [...new Set(tracker.accountsLoggedIn.map(a => a.userId))],
    });
    
    return { 
      suspicious: true, 
      reason: `Suspicious login pattern: ${uniqueAccountsInHour} different accounts from same IP in 1 hour`
    };
  }
  
  return { suspicious: false };
}

/**
 * Check if an IP is flagged for Sybil behavior
 */
export function isIPFlagged(ip: string): { flagged: boolean; reason?: string } {
  const tracker = ipAccountTrackers.get(ip);
  if (!tracker) return { flagged: false };
  return { flagged: tracker.flagged, reason: tracker.flagReason };
}

/**
 * Get IP account tracking stats for admin review
 */
export function getIPTrackingStats(): {
  totalTrackedIPs: number;
  flaggedIPs: number;
  suspiciousIPs: { ip: string; reason: string; accountCount: number }[];
} {
  const flaggedIPs: { ip: string; reason: string; accountCount: number }[] = [];
  
  for (const [ip, tracker] of ipAccountTrackers) {
    if (tracker.flagged) {
      flaggedIPs.push({
        ip,
        reason: tracker.flagReason || 'Unknown',
        accountCount: tracker.accountsCreated.length,
      });
    }
  }
  
  return {
    totalTrackedIPs: ipAccountTrackers.size,
    flaggedIPs: flaggedIPs.length,
    suspiciousIPs: flaggedIPs.slice(0, 50), // Top 50 for admin review
  };
}

/**
 * Clean up old IP tracking data (call periodically)
 */
export function cleanupIPTrackers(): void {
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  for (const [ip, tracker] of ipAccountTrackers) {
    if (now - tracker.lastSeen.getTime() > maxAge) {
      ipAccountTrackers.delete(ip);
    }
  }
}

/**
 * ============================================================================
 * CURRENCY ANOMALY DETECTION
 * ============================================================================
 * 
 * Tracks currency changes per player to detect abnormal gains.
 * Flags accounts that acquire resources faster than legitimately possible.
 */

interface CurrencyTracker {
  playerId: string;
  aaGainedInWindow: number;
  caGainedInWindow: number;
  windowStart: Date;
  lastUpdate: Date;
  flagged: boolean;
  flagReason?: string;
}

const currencyTrackers = new Map<string, CurrencyTracker>();
const CURRENCY_WINDOW_MS = 60 * 1000; // 1 minute window

const CURRENCY_THRESHOLDS = {
  maxAAPerMinute: 500, // Maximum legitimate AA gain per minute (boss kills + treasures)
  maxCAPerMinute: 30, // Maximum legitimate CA gain per minute
};

/**
 * Track currency gain and detect anomalies
 * Call this whenever currency is added to a player
 */
export function trackCurrencyGain(
  playerId: string,
  arcaneAshGained: number,
  crystallineAnimusGained: number,
  source: string,
  ip?: string
): { anomalyDetected: boolean; reason?: string } {
  const now = new Date();
  let tracker = currencyTrackers.get(playerId);
  
  if (!tracker || now.getTime() - tracker.windowStart.getTime() > CURRENCY_WINDOW_MS) {
    // Start new tracking window
    tracker = {
      playerId,
      aaGainedInWindow: 0,
      caGainedInWindow: 0,
      windowStart: now,
      lastUpdate: now,
      flagged: false,
    };
  }
  
  tracker.aaGainedInWindow += arcaneAshGained;
  tracker.caGainedInWindow += crystallineAnimusGained;
  tracker.lastUpdate = now;
  currencyTrackers.set(playerId, tracker);
  
  // Check for anomalies
  if (tracker.aaGainedInWindow > CURRENCY_THRESHOLDS.maxAAPerMinute) {
    tracker.flagged = true;
    tracker.flagReason = `AA gain spike: ${tracker.aaGainedInWindow} in 1 min`;
    
    logSecurityEvent('CURRENCY_ANOMALY_AA', 'HIGH', {
      playerId,
      aaGainedInWindow: tracker.aaGainedInWindow,
      threshold: CURRENCY_THRESHOLDS.maxAAPerMinute,
      source,
      ip,
    }, playerId, ip || 'unknown', 'unknown');
    
    return { 
      anomalyDetected: true, 
      reason: `Arcane Ash gain ${tracker.aaGainedInWindow} exceeds threshold ${CURRENCY_THRESHOLDS.maxAAPerMinute}/min`
    };
  }
  
  if (tracker.caGainedInWindow > CURRENCY_THRESHOLDS.maxCAPerMinute) {
    tracker.flagged = true;
    tracker.flagReason = `CA gain spike: ${tracker.caGainedInWindow} in 1 min`;
    
    logSecurityEvent('CURRENCY_ANOMALY_CA', 'HIGH', {
      playerId,
      caGainedInWindow: tracker.caGainedInWindow,
      threshold: CURRENCY_THRESHOLDS.maxCAPerMinute,
      source,
      ip,
    }, playerId, ip || 'unknown', 'unknown');
    
    return { 
      anomalyDetected: true, 
      reason: `Crystalline Animus gain ${tracker.caGainedInWindow} exceeds threshold ${CURRENCY_THRESHOLDS.maxCAPerMinute}/min`
    };
  }
  
  return { anomalyDetected: false };
}

/**
 * Get currency tracking stats for admin review
 */
export function getCurrencyTrackingStats(): {
  totalTrackedPlayers: number;
  flaggedPlayers: { playerId: string; reason: string }[];
} {
  const flaggedPlayers: { playerId: string; reason: string }[] = [];
  
  for (const [_, tracker] of currencyTrackers) {
    if (tracker.flagged) {
      flaggedPlayers.push({
        playerId: tracker.playerId,
        reason: tracker.flagReason || 'Unknown',
      });
    }
  }
  
  return {
    totalTrackedPlayers: currencyTrackers.size,
    flaggedPlayers,
  };
}

/**
 * ============================================================================
 * ANTI-BOT DETECTION SYSTEM
 * ============================================================================
 * 
 * Multi-layer bot detection targeting:
 * - 24h activity patterns (bots never sleep)
 * - Action sequence patterns (identical patterns across accounts)
 * - Action velocity per type (repetitive farming loops)
 * - Light interaction verification (non-annoying checks)
 */

interface ActivityPattern {
  playerId: string;
  hourlyActivity: Map<number, number>; // hour (0-23) -> action count
  dailyHistory: { date: string; hoursActive: number; totalActions: number }[];
  lastActionTime: Date;
  consecutiveActiveHours: number;
  longestSession: number; // hours without 4h break
  flagged: boolean;
  flagReason?: string;
}

interface ActionSequence {
  actions: string[];
  hash: string;
  count: number;
  lastSeen: Date;
}

interface PatternTracker {
  playerId: string;
  recentSequences: ActionSequence[];
  actionTypeVelocity: Map<string, { count: number; windowStart: Date }>;
  flagged: boolean;
  flagReason?: string;
}

interface InteractionChallenge {
  playerId: string;
  challengeType: 'math' | 'pattern' | 'timing';
  challengeData: any;
  answer: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  resolved: boolean;
}

const activityPatterns = new Map<string, ActivityPattern>();
const patternTrackers = new Map<string, PatternTracker>();
const pendingChallenges = new Map<string, InteractionChallenge>();

const ANTI_BOT_THRESHOLDS = {
  maxConsecutiveActiveHours: 16,       // More than 16 hours without 4h break
  minSleepHoursPerDay: 4,              // Bots typically show 0 hours inactive
  suspiciousHoursActivePerDay: 20,     // 20+ hours active in 24h period
  actionRepetitionThreshold: 50,        // Same action type 50+ times in 5 min
  sequenceSimilarityThreshold: 0.85,   // 85%+ similar action sequences
  sequenceLength: 10,                  // Compare last 10 actions
  challengeExpiryMs: 5 * 60 * 1000,    // 5 minutes to answer
  maxChallengeAttempts: 3,
  challengeTriggerSuspicionScore: 5,   // Trigger challenge after 5 suspicious events
};

/**
 * Track player activity for 24h pattern analysis
 * Detects "bots never sleep" behavior
 */
export function trackActivityPattern(
  playerId: string,
  ip?: string
): { suspicious: boolean; reason?: string; requiresChallenge: boolean } {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const dateKey = now.toISOString().split('T')[0];
  
  let pattern = activityPatterns.get(playerId);
  
  if (!pattern) {
    pattern = {
      playerId,
      hourlyActivity: new Map(),
      dailyHistory: [],
      lastActionTime: now,
      consecutiveActiveHours: 0,
      longestSession: 0,
      flagged: false,
    };
    activityPatterns.set(playerId, pattern);
  }
  
  // Update hourly activity
  const hourlyCount = (pattern.hourlyActivity.get(currentHour) || 0) + 1;
  pattern.hourlyActivity.set(currentHour, hourlyCount);
  
  // Calculate time since last action
  const timeSinceLastAction = now.getTime() - pattern.lastActionTime.getTime();
  const hoursSinceLastAction = timeSinceLastAction / (1000 * 60 * 60);
  
  // Update consecutive active hours
  if (hoursSinceLastAction < 1) {
    // Active within the same hour window
    pattern.consecutiveActiveHours = Math.max(pattern.consecutiveActiveHours, 1);
  } else if (hoursSinceLastAction < 4) {
    // Still in session (less than 4h break)
    pattern.consecutiveActiveHours += Math.floor(hoursSinceLastAction);
  } else {
    // Session break detected - reset counter
    pattern.longestSession = Math.max(pattern.longestSession, pattern.consecutiveActiveHours);
    pattern.consecutiveActiveHours = 1;
  }
  
  pattern.lastActionTime = now;
  
  // Update daily history at end of day
  if (pattern.dailyHistory.length === 0 || 
      pattern.dailyHistory[pattern.dailyHistory.length - 1].date !== dateKey) {
    // Finalize previous day and start new one
    const hoursActive = pattern.hourlyActivity.size;
    const totalActions = Array.from(pattern.hourlyActivity.values()).reduce((a, b) => a + b, 0);
    
    if (pattern.dailyHistory.length > 0) {
      const lastDay = pattern.dailyHistory[pattern.dailyHistory.length - 1];
      lastDay.hoursActive = hoursActive;
      lastDay.totalActions = totalActions;
    }
    
    pattern.dailyHistory.push({
      date: dateKey,
      hoursActive: 0,
      totalActions: 0,
    });
    
    // Keep only last 7 days
    if (pattern.dailyHistory.length > 7) {
      pattern.dailyHistory.shift();
    }
    
    // Reset hourly activity for new day
    pattern.hourlyActivity.clear();
    pattern.hourlyActivity.set(currentHour, 1);
  }
  
  // Check for suspicious patterns
  let suspicionScore = 0;
  let reasons: string[] = [];
  
  // Check 1: Excessive consecutive activity (no sleep)
  if (pattern.consecutiveActiveHours > ANTI_BOT_THRESHOLDS.maxConsecutiveActiveHours) {
    suspicionScore += 3;
    reasons.push(`${pattern.consecutiveActiveHours}h consecutive activity (no breaks)`);
  }
  
  // Check 2: Too many hours active in a day
  const currentDayHoursActive = pattern.hourlyActivity.size;
  if (currentDayHoursActive >= ANTI_BOT_THRESHOLDS.suspiciousHoursActivePerDay) {
    suspicionScore += 2;
    reasons.push(`${currentDayHoursActive}h active today (abnormal)`);
  }
  
  // Check 3: Historical pattern - never sleeps
  const recentDays = pattern.dailyHistory.filter(d => d.hoursActive > 0);
  if (recentDays.length >= 3) {
    const avgHoursActive = recentDays.reduce((a, d) => a + d.hoursActive, 0) / recentDays.length;
    const sleepHours = 24 - avgHoursActive;
    
    if (sleepHours < ANTI_BOT_THRESHOLDS.minSleepHoursPerDay) {
      suspicionScore += 4;
      reasons.push(`Only ${sleepHours.toFixed(1)}h avg sleep over ${recentDays.length} days`);
    }
  }
  
  // Check 4: Longest session without break
  if (pattern.longestSession > ANTI_BOT_THRESHOLDS.maxConsecutiveActiveHours) {
    suspicionScore += 2;
    reasons.push(`Longest session: ${pattern.longestSession}h without 4h break`);
  }
  
  if (suspicionScore >= 3) {
    pattern.flagged = true;
    pattern.flagReason = reasons.join('; ');
    
    logSecurityEvent('BOT_ACTIVITY_PATTERN', suspicionScore >= 5 ? 'CRITICAL' : 'HIGH', {
      playerId,
      suspicionScore,
      consecutiveActiveHours: pattern.consecutiveActiveHours,
      longestSession: pattern.longestSession,
      hoursActiveToday: currentDayHoursActive,
      reasons,
    }, playerId, ip || 'unknown', 'unknown');
    
    return {
      suspicious: true,
      reason: pattern.flagReason,
      requiresChallenge: suspicionScore >= ANTI_BOT_THRESHOLDS.challengeTriggerSuspicionScore,
    };
  }
  
  return { suspicious: false, requiresChallenge: false };
}

/**
 * Track action sequences to detect bot-like repetitive patterns
 */
export function trackActionPattern(
  playerId: string,
  action: string,
  ip?: string
): { suspicious: boolean; reason?: string } {
  const now = new Date();
  
  let tracker = patternTrackers.get(playerId);
  
  if (!tracker) {
    tracker = {
      playerId,
      recentSequences: [],
      actionTypeVelocity: new Map(),
      flagged: false,
    };
    patternTrackers.set(playerId, tracker);
  }
  
  // Track action type velocity
  const actionType = action.split('/').pop() || action; // Extract endpoint name
  let velocity = tracker.actionTypeVelocity.get(actionType);
  
  if (!velocity || now.getTime() - velocity.windowStart.getTime() > 5 * 60 * 1000) {
    // New 5-minute window
    velocity = { count: 0, windowStart: now };
  }
  
  velocity.count++;
  tracker.actionTypeVelocity.set(actionType, velocity);
  
  // Check for repetitive farming
  if (velocity.count > ANTI_BOT_THRESHOLDS.actionRepetitionThreshold) {
    tracker.flagged = true;
    tracker.flagReason = `Repetitive action: ${actionType} x${velocity.count} in 5min`;
    
    logSecurityEvent('BOT_REPETITIVE_ACTION', 'HIGH', {
      playerId,
      actionType,
      count: velocity.count,
      windowMinutes: 5,
    }, playerId, ip || 'unknown', 'unknown');
    
    return {
      suspicious: true,
      reason: tracker.flagReason,
    };
  }
  
  // Build action sequence
  if (tracker.recentSequences.length === 0) {
    tracker.recentSequences.push({
      actions: [action],
      hash: '',
      count: 1,
      lastSeen: now,
    });
  } else {
    const currentSeq = tracker.recentSequences[tracker.recentSequences.length - 1];
    currentSeq.actions.push(action);
    currentSeq.lastSeen = now;
    
    // When sequence reaches target length, hash and compare
    if (currentSeq.actions.length >= ANTI_BOT_THRESHOLDS.sequenceLength) {
      currentSeq.hash = crypto.createHash('md5')
        .update(currentSeq.actions.join('|'))
        .digest('hex');
      
      // Compare with previous sequences
      for (let i = 0; i < tracker.recentSequences.length - 1; i++) {
        const prevSeq = tracker.recentSequences[i];
        if (prevSeq.hash === currentSeq.hash) {
          currentSeq.count++;
          
          if (currentSeq.count >= 3) {
            tracker.flagged = true;
            tracker.flagReason = `Identical action sequence repeated ${currentSeq.count}x`;
            
            logSecurityEvent('BOT_SEQUENCE_PATTERN', 'HIGH', {
              playerId,
              sequenceHash: currentSeq.hash,
              repeatCount: currentSeq.count,
              sequenceActions: currentSeq.actions.slice(0, 5), // First 5 for logging
            }, playerId, ip || 'unknown', 'unknown');
            
            return {
              suspicious: true,
              reason: tracker.flagReason,
            };
          }
        }
      }
      
      // Start new sequence tracking
      tracker.recentSequences.push({
        actions: [],
        hash: '',
        count: 1,
        lastSeen: now,
      });
      
      // Keep only last 20 sequences
      while (tracker.recentSequences.length > 20) {
        tracker.recentSequences.shift();
      }
    }
  }
  
  return { suspicious: false };
}

/**
 * Create a light interaction challenge for suspicious players
 * These are simple, non-annoying checks that humans can solve easily
 */
export function createInteractionChallenge(
  playerId: string
): InteractionChallenge | null {
  // Don't create if one is pending
  if (pendingChallenges.has(playerId)) {
    const existing = pendingChallenges.get(playerId)!;
    if (!existing.resolved && Date.now() < existing.expiresAt.getTime()) {
      return existing;
    }
  }
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ANTI_BOT_THRESHOLDS.challengeExpiryMs);
  
  // Random challenge type
  const challengeTypes: ('math' | 'pattern' | 'timing')[] = ['math', 'pattern', 'timing'];
  const challengeType = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
  
  let challengeData: any;
  let answer: string;
  
  switch (challengeType) {
    case 'math':
      // Simple math: "What is X + Y?" or "What is X - Y?"
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 10) + 1;
      const op = Math.random() > 0.5 ? '+' : '-';
      challengeData = { question: `What is ${a} ${op} ${b}?`, a, b, op };
      answer = String(op === '+' ? a + b : a - b);
      break;
      
    case 'pattern':
      // Simple pattern: "Select the odd one out" or "What comes next?"
      const patterns = [
        { sequence: [2, 4, 6, 8], question: 'What comes next?', answer: '10' },
        { sequence: [1, 3, 5, 7], question: 'What comes next?', answer: '9' },
        { sequence: [5, 10, 15, 20], question: 'What comes next?', answer: '25' },
        { sequence: [3, 6, 9, 12], question: 'What comes next?', answer: '15' },
      ];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      challengeData = { sequence: pattern.sequence, question: pattern.question };
      answer = pattern.answer;
      break;
      
    case 'timing':
      // Timing check: Respond within X seconds (but not too fast)
      const minDelay = 1000 + Math.floor(Math.random() * 2000); // 1-3 seconds
      const maxDelay = minDelay + 5000; // +5 seconds window
      challengeData = { 
        instruction: 'Click the button when it turns green',
        minDelayMs: minDelay,
        maxDelayMs: maxDelay,
      };
      answer = `timing_${minDelay}_${maxDelay}`;
      break;
  }
  
  const challenge: InteractionChallenge = {
    playerId,
    challengeType,
    challengeData,
    answer,
    createdAt: now,
    expiresAt,
    attempts: 0,
    resolved: false,
  };
  
  pendingChallenges.set(playerId, challenge);
  
  logSecurityEvent('CHALLENGE_CREATED', 'MEDIUM', {
    playerId,
    challengeType,
  }, playerId, 'unknown', 'unknown');
  
  return challenge;
}

/**
 * Verify a player's response to an interaction challenge
 */
export function verifyInteractionChallenge(
  playerId: string,
  response: string,
  responseTimeMs?: number
): { valid: boolean; reason?: string; challengeCleared: boolean } {
  const challenge = pendingChallenges.get(playerId);
  
  if (!challenge) {
    return { valid: false, reason: 'No pending challenge', challengeCleared: false };
  }
  
  if (challenge.resolved) {
    return { valid: false, reason: 'Challenge already resolved', challengeCleared: true };
  }
  
  if (Date.now() > challenge.expiresAt.getTime()) {
    pendingChallenges.delete(playerId);
    
    logSecurityEvent('CHALLENGE_EXPIRED', 'HIGH', {
      playerId,
      challengeType: challenge.challengeType,
    }, playerId, 'unknown', 'unknown');
    
    return { valid: false, reason: 'Challenge expired', challengeCleared: false };
  }
  
  challenge.attempts++;
  
  let isCorrect = false;
  
  if (challenge.challengeType === 'timing') {
    // For timing challenges, verify response time is in valid range
    if (responseTimeMs !== undefined) {
      const minDelay = challenge.challengeData.minDelayMs;
      const maxDelay = challenge.challengeData.maxDelayMs;
      isCorrect = responseTimeMs >= minDelay && responseTimeMs <= maxDelay;
    }
  } else {
    // For math/pattern challenges, compare answer
    isCorrect = response.trim().toLowerCase() === challenge.answer.toLowerCase();
  }
  
  if (isCorrect) {
    challenge.resolved = true;
    pendingChallenges.delete(playerId);
    
    logSecurityEvent('CHALLENGE_PASSED', 'LOW', {
      playerId,
      challengeType: challenge.challengeType,
      attempts: challenge.attempts,
    }, playerId, 'unknown', 'unknown');
    
    // Clear flagged status on passed challenge
    const activityPattern = activityPatterns.get(playerId);
    if (activityPattern) {
      activityPattern.flagged = false;
      activityPattern.flagReason = undefined;
    }
    
    const patternTracker = patternTrackers.get(playerId);
    if (patternTracker) {
      patternTracker.flagged = false;
      patternTracker.flagReason = undefined;
    }
    
    return { valid: true, challengeCleared: true };
  }
  
  if (challenge.attempts >= ANTI_BOT_THRESHOLDS.maxChallengeAttempts) {
    pendingChallenges.delete(playerId);
    
    logSecurityEvent('CHALLENGE_FAILED', 'CRITICAL', {
      playerId,
      challengeType: challenge.challengeType,
      attempts: challenge.attempts,
    }, playerId, 'unknown', 'unknown');
    
    return { valid: false, reason: 'Max attempts exceeded - account flagged', challengeCleared: false };
  }
  
  return { 
    valid: false, 
    reason: `Incorrect answer (attempt ${challenge.attempts}/${ANTI_BOT_THRESHOLDS.maxChallengeAttempts})`,
    challengeCleared: false 
  };
}

/**
 * Check if player has a pending challenge
 */
export function hasPendingChallenge(playerId: string): boolean {
  const challenge = pendingChallenges.get(playerId);
  if (!challenge) return false;
  if (challenge.resolved) return false;
  if (Date.now() > challenge.expiresAt.getTime()) {
    pendingChallenges.delete(playerId);
    return false;
  }
  return true;
}

/**
 * Get pending challenge data (without answer) for a player
 * Does NOT create a new challenge - use createInteractionChallenge for that
 */
export function getPendingChallengeData(playerId: string): {
  hasPendingChallenge: boolean;
  challengeType?: 'math' | 'pattern' | 'timing';
  challengeData?: any;
  expiresAt?: Date;
  attempts?: number;
} | null {
  const challenge = pendingChallenges.get(playerId);
  
  if (!challenge) {
    return { hasPendingChallenge: false };
  }
  
  if (challenge.resolved) {
    return { hasPendingChallenge: false };
  }
  
  if (Date.now() > challenge.expiresAt.getTime()) {
    pendingChallenges.delete(playerId);
    return { hasPendingChallenge: false };
  }
  
  return {
    hasPendingChallenge: true,
    challengeType: challenge.challengeType,
    challengeData: challenge.challengeData,
    expiresAt: challenge.expiresAt,
    attempts: challenge.attempts,
  };
}

/**
 * Get anti-bot stats for admin review
 */
export function getAntiBotStats(): {
  totalTrackedPlayers: number;
  flaggedActivityPatterns: { playerId: string; reason: string }[];
  flaggedPatternTrackers: { playerId: string; reason: string }[];
  pendingChallenges: number;
} {
  const flaggedActivity: { playerId: string; reason: string }[] = [];
  const flaggedPatterns: { playerId: string; reason: string }[] = [];
  
  for (const [_, pattern] of activityPatterns) {
    if (pattern.flagged) {
      flaggedActivity.push({
        playerId: pattern.playerId,
        reason: pattern.flagReason || 'Unknown',
      });
    }
  }
  
  for (const [_, tracker] of patternTrackers) {
    if (tracker.flagged) {
      flaggedPatterns.push({
        playerId: tracker.playerId,
        reason: tracker.flagReason || 'Unknown',
      });
    }
  }
  
  return {
    totalTrackedPlayers: activityPatterns.size,
    flaggedActivityPatterns: flaggedActivity,
    flaggedPatternTrackers: flaggedPatterns,
    pendingChallenges: pendingChallenges.size,
  };
}

/**
 * Cleanup old anti-bot tracking data (call periodically)
 */
export function cleanupAntiBotTrackers(): void {
  const now = Date.now();
  const maxInactivityMs = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [playerId, pattern] of activityPatterns) {
    if (now - pattern.lastActionTime.getTime() > maxInactivityMs) {
      activityPatterns.delete(playerId);
    }
  }
  
  // Clean expired challenges
  for (const [playerId, challenge] of pendingChallenges) {
    if (challenge.resolved || now > challenge.expiresAt.getTime()) {
      pendingChallenges.delete(playerId);
    }
  }
}

/**
 * Cross-account pattern detection
 * Identifies identical action patterns across different accounts (bot farms)
 */
export function detectCrossAccountPatterns(): {
  suspiciousGroups: { accountIds: string[]; sharedPatternHash: string; similarity: number }[];
} {
  const patternGroups = new Map<string, string[]>(); // hash -> accountIds
  
  for (const [playerId, tracker] of patternTrackers) {
    for (const seq of tracker.recentSequences) {
      if (seq.hash) {
        const accounts = patternGroups.get(seq.hash) || [];
        if (!accounts.includes(playerId)) {
          accounts.push(playerId);
        }
        patternGroups.set(seq.hash, accounts);
      }
    }
  }
  
  const suspiciousGroups: { accountIds: string[]; sharedPatternHash: string; similarity: number }[] = [];
  
  for (const [hash, accounts] of patternGroups) {
    if (accounts.length > 1) {
      suspiciousGroups.push({
        accountIds: accounts,
        sharedPatternHash: hash,
        similarity: 1.0, // Exact match
      });
      
      logSecurityEvent('CROSS_ACCOUNT_PATTERN', 'CRITICAL', {
        accounts,
        patternHash: hash,
        accountCount: accounts.length,
      });
    }
  }
  
  return { suspiciousGroups };
}
