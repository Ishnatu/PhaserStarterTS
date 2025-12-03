export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityEvent {
  id: string;
  timestamp: number;
  playerId: string;
  eventType: string;
  severity: SecuritySeverity;
  data: Record<string, any>;
  ip?: string;
  endpoint?: string;
}

export interface RequestContext {
  playerId: string;
  endpoint: string;
  ip: string;
  userAgent?: string;
  sessionId?: string;
  timestamp: number;
}

export interface PolicyDecision {
  allow: boolean;
  reason?: string;
  actions?: MitigationAction[];
}

export type MitigationAction = 
  | { type: 'LOG'; severity: SecuritySeverity }
  | { type: 'RATE_LIMIT'; durationMs: number }
  | { type: 'TEMP_BAN'; durationMs: number }
  | { type: 'ALERT'; message: string };

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

export interface SessionValidation {
  valid: boolean;
  playerId?: string;
  error?: string;
}
