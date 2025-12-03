import { runCompaction } from './memoryCompactor';
import { flushToConsole } from './logAggregator';

const COMPACTION_INTERVAL = 60000;
const LOG_FLUSH_INTERVAL = 30000;

let compactionTimer: NodeJS.Timeout | null = null;
let logFlushTimer: NodeJS.Timeout | null = null;

export function startBackgroundJobs(): void {
  if (compactionTimer) return;

  compactionTimer = setInterval(() => {
    try {
      runCompaction();
    } catch (error) {
      console.error('[Scheduler] Compaction error:', error);
    }
  }, COMPACTION_INTERVAL);

  logFlushTimer = setInterval(() => {
    try {
      flushToConsole();
    } catch (error) {
      console.error('[Scheduler] Log flush error:', error);
    }
  }, LOG_FLUSH_INTERVAL);

  console.log('[Tier3] Background jobs started');
}

export function stopBackgroundJobs(): void {
  if (compactionTimer) {
    clearInterval(compactionTimer);
    compactionTimer = null;
  }
  if (logFlushTimer) {
    clearInterval(logFlushTimer);
    logFlushTimer = null;
  }
}
