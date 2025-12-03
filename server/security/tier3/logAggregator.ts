import type { SecurityEvent, SecuritySeverity } from '../events/types';

interface AggregatedLog {
  eventType: string;
  severity: SecuritySeverity;
  count: number;
  firstSeen: number;
  lastSeen: number;
  samplePlayerIds: string[];
}

const aggregatedLogs = new Map<string, AggregatedLog>();
const MAX_SAMPLE_PLAYERS = 5;
const FLUSH_THRESHOLD = 100;

let totalEventsProcessed = 0;
let lastFlush = Date.now();

export function aggregateEvent(event: SecurityEvent): void {
  const key = `${event.eventType}:${event.severity}`;
  let log = aggregatedLogs.get(key);

  if (!log) {
    log = {
      eventType: event.eventType,
      severity: event.severity,
      count: 0,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      samplePlayerIds: [],
    };
    aggregatedLogs.set(key, log);
  }

  log.count++;
  log.lastSeen = event.timestamp;

  if (log.samplePlayerIds.length < MAX_SAMPLE_PLAYERS && 
      !log.samplePlayerIds.includes(event.playerId)) {
    log.samplePlayerIds.push(event.playerId);
  }

  totalEventsProcessed++;

  if (aggregatedLogs.size > FLUSH_THRESHOLD) {
    flushToConsole();
  }
}

export function flushToConsole(): void {
  if (aggregatedLogs.size === 0) return;

  const now = Date.now();
  const duration = now - lastFlush;

  console.log(`[SecurityAggregator] Flush: ${totalEventsProcessed} events in ${duration}ms`);

  const criticalLogs = Array.from(aggregatedLogs.values())
    .filter(log => log.severity === 'CRITICAL' || log.severity === 'HIGH');

  for (const log of criticalLogs) {
    console.log(`  [${log.severity}] ${log.eventType}: ${log.count} occurrences`);
  }

  aggregatedLogs.clear();
  totalEventsProcessed = 0;
  lastFlush = now;
}

export function getAggregatedStats(): { 
  logCount: number; 
  totalEvents: number;
  criticalCount: number;
} {
  let criticalCount = 0;
  for (const log of aggregatedLogs.values()) {
    if (log.severity === 'CRITICAL') {
      criticalCount += log.count;
    }
  }

  return {
    logCount: aggregatedLogs.size,
    totalEvents: totalEventsProcessed,
    criticalCount,
  };
}
