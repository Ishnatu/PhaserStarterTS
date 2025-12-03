import type { SecurityEvent } from '../events/types';
import { securityEventBus } from '../events/eventBus';

interface PlayerMetrics {
  totalEvents: number;
  eventCounts: Map<string, number>;
  lastUpdate: number;
  anomalyScore: number;
}

const playerMetrics = new Map<string, PlayerMetrics>();
const WINDOW_SIZE = 60000;
const SAMPLE_RATE = 0.1;

const ANOMALY_THRESHOLDS: Record<string, number> = {
  'LOOT_ROLL': 10,
  'COMBAT_ACTION': 30,
  'SAVE': 15,
  'FORGE_ATTEMPT': 10,
};

export async function processAnomalyAnalysis(events: SecurityEvent[]): Promise<void> {
  const sampledEvents = events.filter(() => Math.random() < SAMPLE_RATE || events.length < 10);
  
  for (const event of sampledEvents) {
    updateMetrics(event);
  }

  checkForAnomalies();
}

function updateMetrics(event: SecurityEvent): void {
  let metrics = playerMetrics.get(event.playerId);
  const now = Date.now();

  if (!metrics || now - metrics.lastUpdate > WINDOW_SIZE) {
    metrics = {
      totalEvents: 0,
      eventCounts: new Map(),
      lastUpdate: now,
      anomalyScore: 0,
    };
    playerMetrics.set(event.playerId, metrics);
  }

  metrics.totalEvents++;
  const currentCount = metrics.eventCounts.get(event.eventType) || 0;
  metrics.eventCounts.set(event.eventType, currentCount + 1);
}

function checkForAnomalies(): void {
  for (const [playerId, metrics] of playerMetrics.entries()) {
    let anomalyDetected = false;

    for (const [eventType, threshold] of Object.entries(ANOMALY_THRESHOLDS)) {
      const count = metrics.eventCounts.get(eventType) || 0;
      if (count > threshold) {
        anomalyDetected = true;
        metrics.anomalyScore += (count - threshold) * 2;
      }
    }

    if (anomalyDetected && metrics.anomalyScore > 30) {
      securityEventBus.emitQuick(playerId, 'ANOMALY_DETECTED', 'HIGH', {
        score: metrics.anomalyScore,
        eventCounts: Object.fromEntries(metrics.eventCounts),
      });
    }

    metrics.anomalyScore = Math.max(0, metrics.anomalyScore - 5);
  }
}

export function cleanupStaleMetrics(): number {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000;
  let cleaned = 0;

  for (const [playerId, metrics] of playerMetrics.entries()) {
    if (now - metrics.lastUpdate > staleThreshold) {
      playerMetrics.delete(playerId);
      cleaned++;
    }
  }

  return cleaned;
}

export function getAnomalyStats(): { playerCount: number } {
  return { playerCount: playerMetrics.size };
}
