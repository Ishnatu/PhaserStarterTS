import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { logSecurityEvent } from "../security";
import { SeededRNG } from "../utils/SeededRNG";

interface TrapEncounterSession {
  userId: string;
  createdAt: number;
  consumed: boolean;
  zoneId: string;
}

interface TrapSessionRateLimit {
  count: number;
  windowStart: number;
}

const trapSessions = new Map<string, TrapEncounterSession>();
const trapSessionRateLimits = new Map<string, TrapSessionRateLimit>();
const TRAP_SESSION_EXPIRY_MS = 5 * 60 * 1000;
const TRAP_SESSION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const TRAP_SESSION_RATE_LIMIT_MAX = 3;

function cleanupExpiredTrapSessions() {
  const now = Date.now();
  for (const [key, session] of trapSessions) {
    if (now - session.createdAt > TRAP_SESSION_EXPIRY_MS || session.consumed) {
      trapSessions.delete(key);
    }
  }
}

export function createTrapSession(userId: string, zoneId: string): string {
  cleanupExpiredTrapSessions();
  const sessionId = `trap_${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  trapSessions.set(sessionId, {
    userId,
    createdAt: Date.now(),
    consumed: false,
    zoneId,
  });
  return sessionId;
}

export function registerEncounterRoutes(app: Express) {
  app.post("/api/encounter/trap/attempt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sessionId } = req.body;

      cleanupExpiredTrapSessions();
      
      if (!sessionId) {
        logSecurityEvent(userId, 'TRAP_NO_SESSION', 'CRITICAL', {
          message: 'Trap attempt without sessionId - EXPLOIT ATTEMPT',
          ip: req.ip,
        });
        return res.status(403).json({ message: "Session ID required - encounter not registered" });
      }
      
      const session = trapSessions.get(sessionId);
      if (!session) {
        logSecurityEvent(userId, 'TRAP_INVALID_SESSION', 'CRITICAL', {
          message: 'Trap attempt with invalid sessionId - EXPLOIT ATTEMPT',
          ip: req.ip,
          sessionId,
        });
        return res.status(403).json({ message: "Invalid or expired session" });
      }
      
      if (session.userId !== userId) {
        logSecurityEvent(userId, 'TRAP_SESSION_MISMATCH', 'CRITICAL', {
          message: 'Trap session user mismatch - EXPLOIT ATTEMPT',
          ip: req.ip,
          sessionId,
          sessionUserId: session.userId,
        });
        return res.status(403).json({ message: "Session does not belong to this user" });
      }
      
      if (session.consumed) {
        logSecurityEvent(userId, 'TRAP_SESSION_REUSE', 'HIGH', {
          message: 'Trap session already consumed - replay attempt',
          ip: req.ip,
          sessionId,
        });
        return res.status(403).json({ message: "Session already used" });
      }
      
      session.consumed = true;
      trapSessions.set(sessionId, session);

      const rng = new SeededRNG(Date.now() + parseInt(userId.replace(/\D/g, '').slice(0, 9) || '0', 10));
      const skillCheck = rng.next();
      
      if (skillCheck < 0.60) {
        const aa = rng.nextInt(40, 80);
        const ca = rng.nextInt(3, 6);

        await storage.ensurePlayerCurrency(userId, 0, 0);
        const currencies = await storage.addCurrency(userId, aa, ca);

        logSecurityEvent(userId, 'TRAP_DISARM_SUCCESS', 'LOW', {
          sessionId,
          zoneId: session.zoneId,
          arcaneAshReward: aa,
          crystallineAnimusReward: ca,
        });

        res.json({
          success: true,
          disarmed: true,
          arcaneAshReward: aa,
          crystallineAnimusReward: ca,
          arcaneAsh: currencies.arcaneAsh,
          crystallineAnimus: currencies.crystallineAnimus,
        });
      } else {
        const damage = rng.nextInt(15, 25);

        logSecurityEvent(userId, 'TRAP_DISARM_FAILED', 'LOW', {
          sessionId,
          zoneId: session.zoneId,
          damage,
        });

        res.json({
          success: true,
          disarmed: false,
          damage,
        });
      }
    } catch (error) {
      console.error("Error processing trap attempt:", error);
      res.status(500).json({ message: "Failed to process trap attempt" });
    }
  });

  app.post("/api/encounter/trap/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { zoneId } = req.body;

      const now = Date.now();
      let rateLimit = trapSessionRateLimits.get(userId);
      
      if (!rateLimit || now - rateLimit.windowStart > TRAP_SESSION_RATE_LIMIT_WINDOW_MS) {
        rateLimit = { count: 0, windowStart: now };
      }
      
      rateLimit.count++;
      trapSessionRateLimits.set(userId, rateLimit);
      
      if (rateLimit.count > TRAP_SESSION_RATE_LIMIT_MAX) {
        logSecurityEvent(userId, 'TRAP_SESSION_RATE_LIMIT', 'HIGH', {
          message: 'Trap session rate limit exceeded - possible farming attempt',
          ip: req.ip,
          count: rateLimit.count,
        });
        return res.status(429).json({ 
          message: "Too many trap sessions requested. Please wait before trying again.",
          retryAfter: Math.ceil((rateLimit.windowStart + TRAP_SESSION_RATE_LIMIT_WINDOW_MS - now) / 1000),
        });
      }

      const sessionId = createTrapSession(userId, zoneId || 'unknown');

      res.json({
        success: true,
        sessionId,
      });
    } catch (error) {
      console.error("Error creating trap session:", error);
      res.status(500).json({ message: "Failed to create trap session" });
    }
  });
}
