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

const trapSessions = new Map<string, TrapEncounterSession>();
const TRAP_SESSION_EXPIRY_MS = 5 * 60 * 1000;

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
      const { sessionId, zoneId } = req.body;

      cleanupExpiredTrapSessions();
      
      let validSession = false;
      if (sessionId) {
        const session = trapSessions.get(sessionId);
        if (session && session.userId === userId && !session.consumed) {
          validSession = true;
          session.consumed = true;
          trapSessions.set(sessionId, session);
        }
      }

      const rng = new SeededRNG(Date.now() + parseInt(userId.replace(/\D/g, '').slice(0, 9) || '0', 10));
      const skillCheck = rng.next();
      
      if (skillCheck < 0.60) {
        const aa = rng.nextInt(40, 80);
        const ca = rng.nextInt(3, 6);

        await storage.ensurePlayerCurrency(userId, 0, 0);
        const currencies = await storage.addCurrency(userId, aa, ca);

        logSecurityEvent(userId, 'TRAP_DISARM_SUCCESS', 'LOW', {
          sessionId: sessionId || 'no_session',
          validSession,
          zoneId,
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
          sessionId: sessionId || 'no_session',
          validSession,
          zoneId,
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
