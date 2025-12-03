import type { SecurityEvent } from '../events/types';
import { securityEventBus } from '../events/eventBus';

interface PlayerPattern {
  recentEvents: { type: string; timestamp: number }[];
  suspiciousScore: number;
  lastAnalyzed: number;
}

const playerPatterns = new Map<string, PlayerPattern>();
const MAX_RECENT_EVENTS = 100;
const ANALYSIS_COOLDOWN = 5000;

const SUSPICIOUS_PATTERNS = [
  { events: ['LOOT_ROLL', 'LOOT_ROLL', 'LOOT_ROLL'], timeWindowMs: 2000, score: 10 },
  { events: ['FORGE_ATTEMPT', 'FORGE_ATTEMPT', 'FORGE_ATTEMPT'], timeWindowMs: 3000, score: 15 },
  { events: ['COMBAT_ACTION', 'COMBAT_ACTION', 'COMBAT_ACTION', 'COMBAT_ACTION'], timeWindowMs: 1000, score: 20 },
];

export async function processPatternDetection(events: SecurityEvent[]): Promise<void> {
  const now = Date.now();

  for (const event of events) {
    let pattern = playerPatterns.get(event.playerId);
    
    if (!pattern) {
      pattern = { recentEvents: [], suspiciousScore: 0, lastAnalyzed: 0 };
      playerPatterns.set(event.playerId, pattern);
    }

    pattern.recentEvents.push({ type: event.eventType, timestamp: event.timestamp });

    if (pattern.recentEvents.length > MAX_RECENT_EVENTS) {
      pattern.recentEvents = pattern.recentEvents.slice(-MAX_RECENT_EVENTS);
    }

    if (now - pattern.lastAnalyzed > ANALYSIS_COOLDOWN) {
      analyzePatterns(event.playerId, pattern);
      pattern.lastAnalyzed = now;
    }
  }

  cleanupOldPatterns();
}

function analyzePatterns(playerId: string, pattern: PlayerPattern): void {
  const now = Date.now();
  let scoreIncrease = 0;

  for (const suspiciousPattern of SUSPICIOUS_PATTERNS) {
    const recentInWindow = pattern.recentEvents.filter(
      e => now - e.timestamp < suspiciousPattern.timeWindowMs
    );

    let matchCount = 0;
    let patternIdx = 0;
    
    for (const event of recentInWindow) {
      if (event.type === suspiciousPattern.events[patternIdx]) {
        patternIdx++;
        if (patternIdx >= suspiciousPattern.events.length) {
          matchCount++;
          patternIdx = 0;
        }
      }
    }

    if (matchCount > 0) {
      scoreIncrease += suspiciousPattern.score * matchCount;
    }
  }

  if (scoreIncrease > 0) {
    pattern.suspiciousScore += scoreIncrease;

    if (pattern.suspiciousScore > 50) {
      securityEventBus.emitQuick(playerId, 'PATTERN_ALERT', 'HIGH', {
        score: pattern.suspiciousScore,
        message: 'Suspicious activity pattern detected',
      });
    }
  }

  pattern.suspiciousScore = Math.max(0, pattern.suspiciousScore - 1);
}

function cleanupOldPatterns(): void {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000;

  for (const [playerId, pattern] of playerPatterns.entries()) {
    const lastEvent = pattern.recentEvents[pattern.recentEvents.length - 1];
    if (!lastEvent || now - lastEvent.timestamp > staleThreshold) {
      playerPatterns.delete(playerId);
    }
  }
}

export function getPatternStats(): { playerCount: number } {
  return { playerCount: playerPatterns.size };
}
