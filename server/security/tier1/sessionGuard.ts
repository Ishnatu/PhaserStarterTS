import type { SessionValidation } from '../events/types';

const validSessions = new Map<string, { playerId: string; lastSeen: number }>();
const SESSION_TTL = 30 * 60 * 1000;

export function validateSession(sessionId: string | undefined): SessionValidation {
  if (!sessionId) {
    return { valid: false, error: 'No session provided' };
  }

  const session = validSessions.get(sessionId);
  if (!session) {
    return { valid: false, error: 'Session not found' };
  }

  const now = Date.now();
  if (now - session.lastSeen > SESSION_TTL) {
    validSessions.delete(sessionId);
    return { valid: false, error: 'Session expired' };
  }

  session.lastSeen = now;
  return { valid: true, playerId: session.playerId };
}

export function registerSession(sessionId: string, playerId: string): void {
  validSessions.set(sessionId, { playerId, lastSeen: Date.now() });
}

export function invalidateSession(sessionId: string): void {
  validSessions.delete(sessionId);
}

export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [id, session] of validSessions.entries()) {
    if (now - session.lastSeen > SESSION_TTL) {
      validSessions.delete(id);
      cleaned++;
    }
  }
  
  return cleaned;
}

export function getActiveSessionCount(): number {
  return validSessions.size;
}
