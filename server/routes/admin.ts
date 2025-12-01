import type { Express } from "express";
import { db } from "../db";
import { 
  playerCurrencies, 
  playerDailyLimits, 
  securityAuditLog, 
  forgeAttempts,
  playerWithdrawals,
  users
} from "../../shared/schema";
import { eq, desc, sql, gte, and, count, sum } from "drizzle-orm";
import { getIPTrackingStats, getSecurityStats } from "../securityMonitor";
import { getQueryStats, resetQueryStats, getSlowQueryThreshold, getCriticalQueryThreshold } from "../db/queryMonitor";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const ADMIN_KEY = process.env.ADMIN_KEY;

function validateAdminAccess(req: any, res: any): boolean {
  const providedKey = req.headers['x-admin-key'];
  
  if (!ADMIN_KEY || ADMIN_KEY.length < 32) {
    console.error('[ADMIN] ADMIN_KEY not configured or too short');
    res.status(500).json({ message: 'Admin access not configured' });
    return false;
  }
  
  if (!providedKey || providedKey !== ADMIN_KEY) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  
  return true;
}

export function registerAdminRoutes(app: Express) {
  /**
   * GET /api/admin/dashboard
   * Main dashboard summary - token health, player stats, alerts
   */
  app.get("/api/admin/dashboard", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Total currency in circulation
      const [currencyTotals] = await db
        .select({
          totalAA: sum(playerCurrencies.arcaneAsh),
          totalCA: sum(playerCurrencies.crystallineAnimus),
          playerCount: count(),
        })
        .from(playerCurrencies);
      
      // Today's earnings across all players
      const [todayEarnings] = await db
        .select({
          totalAA: sum(playerDailyLimits.aaEarned),
          totalCA: sum(playerDailyLimits.caEarned),
          activePlayers: count(),
        })
        .from(playerDailyLimits)
        .where(eq(playerDailyLimits.date, today));
      
      // Yesterday's earnings for comparison
      const [yesterdayEarnings] = await db
        .select({
          totalAA: sum(playerDailyLimits.aaEarned),
          totalCA: sum(playerDailyLimits.caEarned),
          activePlayers: count(),
        })
        .from(playerDailyLimits)
        .where(eq(playerDailyLimits.date, yesterday));
      
      // Recent security alerts (last 24h)
      const recentAlerts = await db
        .select()
        .from(securityAuditLog)
        .where(
          and(
            gte(securityAuditLog.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
            sql`${securityAuditLog.severity} IN ('warning', 'critical')`
          )
        )
        .orderBy(desc(securityAuditLog.createdAt))
        .limit(20);
      
      // Get IP tracking stats
      const ipStats = getIPTrackingStats();
      
      // Get general security stats
      const securityStats = getSecurityStats();
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        tokenHealth: {
          totalArcaneAsh: Number(currencyTotals?.totalAA) || 0,
          totalCrystallineAnimus: Number(currencyTotals?.totalCA) || 0,
          totalPlayers: Number(currencyTotals?.playerCount) || 0,
        },
        dailyActivity: {
          today: {
            date: today,
            aaEarned: Number(todayEarnings?.totalAA) || 0,
            caEarned: Number(todayEarnings?.totalCA) || 0,
            activePlayers: Number(todayEarnings?.activePlayers) || 0,
          },
          yesterday: {
            date: yesterday,
            aaEarned: Number(yesterdayEarnings?.totalAA) || 0,
            caEarned: Number(yesterdayEarnings?.totalCA) || 0,
            activePlayers: Number(yesterdayEarnings?.activePlayers) || 0,
          },
        },
        security: {
          recentAlerts: recentAlerts.map(a => ({
            id: a.id,
            type: a.eventType,
            severity: a.severity,
            playerId: a.playerId,
            createdAt: a.createdAt,
            metadata: a.metadata,
          })),
          alertCount: recentAlerts.length,
          flaggedIPs: ipStats.flaggedIPs,
          totalTrackedIPs: ipStats.totalTrackedIPs,
          suspiciousIPs: ipStats.suspiciousIPs.slice(0, 10),
          ...securityStats,
        },
      });
    } catch (error) {
      console.error("Error getting admin dashboard:", error);
      res.status(500).json({ message: "Failed to get dashboard data" });
    }
  });

  /**
   * GET /api/admin/economy/supply
   * Token supply breakdown and trends
   */
  app.get("/api/admin/economy/supply", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      // Get all players with their currency
      const players = await db
        .select({
          playerId: playerCurrencies.playerId,
          arcaneAsh: playerCurrencies.arcaneAsh,
          crystallineAnimus: playerCurrencies.crystallineAnimus,
          level: playerCurrencies.level,
        })
        .from(playerCurrencies)
        .orderBy(desc(playerCurrencies.arcaneAsh))
        .limit(100);
      
      // Calculate totals
      const totalAA = players.reduce((sum, p) => sum + p.arcaneAsh, 0);
      const totalCA = players.reduce((sum, p) => sum + p.crystallineAnimus, 0);
      
      // Top 10 holders
      const topAAHolders = players
        .sort((a, b) => b.arcaneAsh - a.arcaneAsh)
        .slice(0, 10)
        .map(p => ({
          playerId: p.playerId,
          amount: p.arcaneAsh,
          percentOfSupply: totalAA > 0 ? ((p.arcaneAsh / totalAA) * 100).toFixed(2) : '0',
        }));
      
      const topCAHolders = players
        .sort((a, b) => b.crystallineAnimus - a.crystallineAnimus)
        .slice(0, 10)
        .map(p => ({
          playerId: p.playerId,
          amount: p.crystallineAnimus,
          percentOfSupply: totalCA > 0 ? ((p.crystallineAnimus / totalCA) * 100).toFixed(2) : '0',
        }));
      
      // Distribution analysis
      const aaDistribution = {
        median: 0,
        average: players.length > 0 ? totalAA / players.length : 0,
        max: players.length > 0 ? Math.max(...players.map(p => p.arcaneAsh)) : 0,
        min: players.length > 0 ? Math.min(...players.map(p => p.arcaneAsh)) : 0,
      };
      
      if (players.length > 0) {
        const sorted = [...players].sort((a, b) => a.arcaneAsh - b.arcaneAsh);
        const mid = Math.floor(sorted.length / 2);
        aaDistribution.median = sorted.length % 2 === 0
          ? (sorted[mid - 1].arcaneAsh + sorted[mid].arcaneAsh) / 2
          : sorted[mid].arcaneAsh;
      }
      
      res.json({
        success: true,
        supply: {
          totalArcaneAsh: totalAA,
          totalCrystallineAnimus: totalCA,
          playerCount: players.length,
        },
        distribution: {
          arcaneAsh: aaDistribution,
        },
        topHolders: {
          arcaneAsh: topAAHolders,
          crystallineAnimus: topCAHolders,
        },
      });
    } catch (error) {
      console.error("Error getting economy supply:", error);
      res.status(500).json({ message: "Failed to get supply data" });
    }
  });

  /**
   * GET /api/admin/economy/velocity
   * Daily earning/spending velocity
   */
  app.get("/api/admin/economy/velocity", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      // Get last 7 days of daily limits data
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const dailyData = await db
        .select({
          date: playerDailyLimits.date,
          totalAA: sum(playerDailyLimits.aaEarned),
          totalCA: sum(playerDailyLimits.caEarned),
          totalTraps: sum(playerDailyLimits.trapAttempts),
          totalTreasures: sum(playerDailyLimits.treasureClaims),
          totalShrines: sum(playerDailyLimits.shrineOffers),
          uniquePlayers: count(),
        })
        .from(playerDailyLimits)
        .where(gte(playerDailyLimits.date, weekAgo))
        .groupBy(playerDailyLimits.date)
        .orderBy(desc(playerDailyLimits.date));
      
      // Get forging data (currency sinks)
      const forgingData = await db
        .select({
          totalAACost: sum(forgeAttempts.costArcaneAsh),
          totalCACost: sum(forgeAttempts.costCrystallineAnimus),
          totalAttempts: count(),
          successfulAttempts: sql<number>`SUM(CASE WHEN ${forgeAttempts.success} = true THEN 1 ELSE 0 END)`,
        })
        .from(forgeAttempts)
        .where(gte(forgeAttempts.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
      
      res.json({
        success: true,
        dailyVelocity: dailyData.map(d => ({
          date: d.date,
          aaEarned: Number(d.totalAA) || 0,
          caEarned: Number(d.totalCA) || 0,
          trapAttempts: Number(d.totalTraps) || 0,
          treasureClaims: Number(d.totalTreasures) || 0,
          shrineOffers: Number(d.totalShrines) || 0,
          uniquePlayers: Number(d.uniquePlayers) || 0,
        })),
        forgingSink: {
          aaBurned: Number(forgingData[0]?.totalAACost) || 0,
          caBurned: Number(forgingData[0]?.totalCACost) || 0,
          totalAttempts: Number(forgingData[0]?.totalAttempts) || 0,
          successRate: forgingData[0]?.totalAttempts 
            ? ((Number(forgingData[0]?.successfulAttempts) / Number(forgingData[0]?.totalAttempts)) * 100).toFixed(1)
            : '0',
        },
      });
    } catch (error) {
      console.error("Error getting economy velocity:", error);
      res.status(500).json({ message: "Failed to get velocity data" });
    }
  });

  /**
   * GET /api/admin/players/:playerId
   * Get detailed info about a specific player
   */
  app.get("/api/admin/players/:playerId", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      const { playerId } = req.params;
      
      // Get player currency
      const [currency] = await db
        .select()
        .from(playerCurrencies)
        .where(eq(playerCurrencies.playerId, playerId))
        .limit(1);
      
      // Get user info
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, playerId))
        .limit(1);
      
      // Get today's limits
      const today = new Date().toISOString().split('T')[0];
      const [todayLimits] = await db
        .select()
        .from(playerDailyLimits)
        .where(and(
          eq(playerDailyLimits.playerId, playerId),
          eq(playerDailyLimits.date, today)
        ))
        .limit(1);
      
      // Get recent security events
      const recentEvents = await db
        .select()
        .from(securityAuditLog)
        .where(eq(securityAuditLog.playerId, playerId))
        .orderBy(desc(securityAuditLog.createdAt))
        .limit(20);
      
      // Get withdrawal history
      const withdrawals = await db
        .select()
        .from(playerWithdrawals)
        .where(eq(playerWithdrawals.playerId, playerId))
        .orderBy(desc(playerWithdrawals.createdAt))
        .limit(10);
      
      // Get forge history
      const forges = await db
        .select()
        .from(forgeAttempts)
        .where(eq(forgeAttempts.playerId, playerId))
        .orderBy(desc(forgeAttempts.createdAt))
        .limit(20);
      
      if (!currency && !user) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      res.json({
        success: true,
        player: {
          id: playerId,
          username: user?.username,
          createdAt: user?.createdAt,
          currency: currency ? {
            arcaneAsh: currency.arcaneAsh,
            crystallineAnimus: currency.crystallineAnimus,
            level: currency.level,
            experience: currency.experience,
          } : null,
          todayLimits: todayLimits ? {
            trapAttempts: todayLimits.trapAttempts,
            treasureClaims: todayLimits.treasureClaims,
            shrineOffers: todayLimits.shrineOffers,
            aaEarned: todayLimits.aaEarned,
            caEarned: todayLimits.caEarned,
          } : null,
        },
        recentEvents: recentEvents.map(e => ({
          type: e.eventType,
          severity: e.severity,
          createdAt: e.createdAt,
          metadata: e.metadata,
        })),
        withdrawals: withdrawals.map(w => ({
          id: w.id,
          amount: w.amount,
          currencyType: w.currencyType,
          status: w.status,
          createdAt: w.createdAt,
        })),
        forges: forges.map(f => ({
          itemId: f.itemId,
          fromLevel: f.fromLevel,
          toLevel: f.toLevel,
          success: f.success,
          costAA: f.costArcaneAsh,
          costCA: f.costCrystallineAnimus,
          createdAt: f.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error getting player details:", error);
      res.status(500).json({ message: "Failed to get player details" });
    }
  });

  /**
   * GET /api/admin/security/alerts
   * Get security alerts with filtering
   */
  app.get("/api/admin/security/alerts", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      const severity = req.query.severity as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      
      let alerts;
      
      if (severity && ['warning', 'critical'].includes(severity)) {
        alerts = await db
          .select()
          .from(securityAuditLog)
          .where(eq(securityAuditLog.severity, severity))
          .orderBy(desc(securityAuditLog.createdAt))
          .limit(limit);
      } else {
        alerts = await db
          .select()
          .from(securityAuditLog)
          .orderBy(desc(securityAuditLog.createdAt))
          .limit(limit);
      }
      
      res.json({
        success: true,
        alerts: alerts.map(a => ({
          id: a.id,
          type: a.eventType,
          severity: a.severity,
          playerId: a.playerId,
          ipAddress: a.ipAddress,
          createdAt: a.createdAt,
          metadata: a.metadata,
        })),
        count: alerts.length,
      });
    } catch (error) {
      console.error("Error getting security alerts:", error);
      res.status(500).json({ message: "Failed to get alerts" });
    }
  });

  /**
   * POST /api/admin/players/:playerId/reset-limits
   * Reset a player's daily limits (admin override)
   */
  app.post("/api/admin/players/:playerId/reset-limits", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      const { playerId } = req.params;
      const today = new Date().toISOString().split('T')[0];
      
      await db
        .update(playerDailyLimits)
        .set({
          trapAttempts: 0,
          treasureClaims: 0,
          shrineOffers: 0,
          aaEarned: 0,
          caEarned: 0,
          updatedAt: new Date(),
        })
        .where(and(
          eq(playerDailyLimits.playerId, playerId),
          eq(playerDailyLimits.date, today)
        ));
      
      res.json({
        success: true,
        message: `Daily limits reset for player ${playerId}`,
      });
    } catch (error) {
      console.error("Error resetting player limits:", error);
      res.status(500).json({ message: "Failed to reset limits" });
    }
  });

  /**
   * GET /api/admin/database/query-stats
   * Get database query performance statistics
   */
  app.get("/api/admin/database/query-stats", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      const stats = getQueryStats();
      
      res.json({
        success: true,
        thresholds: {
          slowQueryMs: getSlowQueryThreshold(),
          criticalQueryMs: getCriticalQueryThreshold(),
        },
        stats: {
          totalQueries: stats.totalQueries,
          slowQueries: stats.slowQueries,
          failedQueries: stats.failedQueries,
          averageDuration: stats.averageDuration,
          p95Duration: stats.p95Duration,
          p99Duration: stats.p99Duration,
        },
        queriesByType: stats.queriesByType,
        slowestQueries: stats.slowestQueries.map(q => ({
          queryType: q.queryType,
          tableName: q.tableName,
          duration: q.duration,
          rowCount: q.rowCount,
          success: q.success,
          error: q.error,
          timestamp: new Date(q.startTime).toISOString(),
        })),
      });
    } catch (error) {
      console.error("Error getting query stats:", error);
      res.status(500).json({ message: "Failed to get query stats" });
    }
  });

  /**
   * POST /api/admin/database/reset-query-stats
   * Reset query statistics (for testing/maintenance)
   */
  app.post("/api/admin/database/reset-query-stats", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      resetQueryStats();
      
      res.json({
        success: true,
        message: "Query statistics reset successfully",
      });
    } catch (error) {
      console.error("Error resetting query stats:", error);
      res.status(500).json({ message: "Failed to reset query stats" });
    }
  });

  /**
   * GET /api/admin/database/slow-queries
   * Get slow query log from database
   */
  app.get("/api/admin/database/slow-queries", async (req, res) => {
    if (!validateAdminAccess(req, res)) return;
    
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const hours = Math.min(parseInt(req.query.hours as string) || 24, 168);
      
      const slowQueryLogs = await db
        .select()
        .from(securityAuditLog)
        .where(
          and(
            eq(securityAuditLog.eventType, 'SLOW_QUERY'),
            gte(securityAuditLog.createdAt, new Date(Date.now() - hours * 60 * 60 * 1000))
          )
        )
        .orderBy(desc(securityAuditLog.createdAt))
        .limit(limit);
      
      res.json({
        success: true,
        count: slowQueryLogs.length,
        timeRange: `${hours} hours`,
        queries: slowQueryLogs.map(log => ({
          id: log.id,
          severity: log.severity,
          metadata: log.metadata,
          createdAt: log.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error getting slow query logs:", error);
      res.status(500).json({ message: "Failed to get slow query logs" });
    }
  });

  /**
   * GET /admin
   * Serve the admin dashboard HTML
   */
  app.get("/admin", (req, res) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dashboardPath = path.join(__dirname, "..", "admin-dashboard.html");
    
    if (fs.existsSync(dashboardPath)) {
      res.sendFile(dashboardPath);
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  });
}
