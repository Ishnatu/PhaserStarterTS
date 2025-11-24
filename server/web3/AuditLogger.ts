import { db } from '../db';
import { securityAuditLog } from '../../shared/schema';

export interface AuditLogEntry {
  eventType: string;
  playerId?: string;
  sessionId?: string;
  metadata: any;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical';
}

export class AuditLogger {
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await db.insert(securityAuditLog).values({
        eventType: entry.eventType,
        playerId: entry.playerId,
        sessionId: entry.sessionId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        severity: entry.severity || 'info',
      });
    } catch (error) {
      console.error('Audit logging error:', error);
    }
  }

  static async logForgeAttempt(
    playerId: string,
    itemId: string,
    fromLevel: number,
    toLevel: number,
    success: boolean,
    costAA: number,
    costCA: number
  ): Promise<void> {
    await this.log({
      eventType: 'forge_attempt',
      playerId,
      severity: 'info',
      metadata: {
        itemId,
        fromLevel,
        toLevel,
        success,
        costArcaneAsh: costAA,
        costCrystallineAnimus: costCA,
      },
    });
  }

  static async logMarketplaceTrade(
    sellerId: string,
    buyerId: string | null,
    itemId: string,
    price: number,
    currencyType: string,
    status: string
  ): Promise<void> {
    await this.log({
      eventType: 'marketplace_trade',
      playerId: sellerId,
      severity: 'info',
      metadata: {
        sellerId,
        buyerId,
        itemId,
        price,
        currencyType,
        status,
      },
    });
  }

  static async logSuspiciousActivity(
    eventType: string,
    playerId: string | undefined,
    metadata: any,
    sessionId?: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      eventType,
      playerId,
      sessionId,
      ipAddress,
      severity: 'critical',
      metadata,
    });
  }
}
