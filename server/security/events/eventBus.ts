import type { SecurityEvent, SecuritySeverity } from './types';

type EventProcessor = (events: SecurityEvent[]) => Promise<void>;

const MAX_QUEUE_SIZE = 1000;
const PROCESS_INTERVAL_MS = 500;
const BATCH_SIZE = 50;

class SecurityEventBus {
  private queue: SecurityEvent[] = [];
  private processors: Map<string, EventProcessor> = new Map();
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private droppedCount = 0;

  start(): void {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.processQueue();
    }, PROCESS_INTERVAL_MS);
    
    console.log('[SecurityEventBus] Started async event processing');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  registerProcessor(name: string, processor: EventProcessor): void {
    this.processors.set(name, processor);
    console.log(`[SecurityEventBus] Registered processor: ${name}`);
  }

  emit(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.droppedCount++;
      if (this.droppedCount % 100 === 0) {
        console.warn(`[SecurityEventBus] Queue full, dropped ${this.droppedCount} events`);
      }
      return;
    }

    const fullEvent: SecurityEvent = {
      ...event,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    this.queue.push(fullEvent);
  }

  emitQuick(
    playerId: string,
    eventType: string,
    severity: SecuritySeverity,
    data: Record<string, any> = {},
    ip?: string,
    endpoint?: string
  ): void {
    this.emit({ playerId, eventType, severity, data, ip, endpoint });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    try {
      const batch = this.queue.splice(0, BATCH_SIZE);
      
      if (batch.length === 0) return;

      const processorPromises = Array.from(this.processors.values()).map(
        processor => processor(batch).catch(err => {
          console.error('[SecurityEventBus] Processor error:', err);
        })
      );

      await Promise.all(processorPromises);
    } finally {
      this.isProcessing = false;
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getDroppedCount(): number {
    return this.droppedCount;
  }

  resetStats(): void {
    this.droppedCount = 0;
  }
}

export const securityEventBus = new SecurityEventBus();
