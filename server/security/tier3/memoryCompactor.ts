import { cleanupExpiredSessions, getActiveSessionCount } from '../tier1/sessionGuard';
import { cleanupStaleMetrics, getAnomalyStats } from '../tier2/anomalyAnalyzer';
import { getPatternStats } from '../tier2/patternDetector';
import { securityEventBus } from '../events/eventBus';
import { flushToConsole, getAggregatedStats } from './logAggregator';

interface CompactionStats {
  sessionsCleared: number;
  metricsCleared: number;
  eventQueueSize: number;
  timestamp: number;
}

let lastCompaction: CompactionStats | null = null;

export function runCompaction(): CompactionStats {
  const sessionsCleared = cleanupExpiredSessions();
  const metricsCleared = cleanupStaleMetrics();
  
  flushToConsole();

  const stats: CompactionStats = {
    sessionsCleared,
    metricsCleared,
    eventQueueSize: securityEventBus.getQueueSize(),
    timestamp: Date.now(),
  };

  lastCompaction = stats;

  if (sessionsCleared > 0 || metricsCleared > 0) {
    console.log(`[MemoryCompactor] Cleaned ${sessionsCleared} sessions, ${metricsCleared} metrics`);
  }

  return stats;
}

export function getSecuritySystemStats(): {
  sessions: number;
  patternPlayers: number;
  anomalyPlayers: number;
  eventQueue: number;
  droppedEvents: number;
  aggregatedLogs: { logCount: number; totalEvents: number; criticalCount: number };
  lastCompaction: CompactionStats | null;
} {
  return {
    sessions: getActiveSessionCount(),
    patternPlayers: getPatternStats().playerCount,
    anomalyPlayers: getAnomalyStats().playerCount,
    eventQueue: securityEventBus.getQueueSize(),
    droppedEvents: securityEventBus.getDroppedCount(),
    aggregatedLogs: getAggregatedStats(),
    lastCompaction,
  };
}
