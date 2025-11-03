import { ApiClient } from './ApiClient';
import { SessionManager } from './SessionManager';

export class HeartbeatManager {
  private static instance: HeartbeatManager;
  private intervalId: number | null = null;
  private playerId: string; // Stable ID shared across tabs
  private instanceId: string; // Unique ID for this tab
  private onDuplicateDetected: (() => void) | null = null;
  private isShuttingDown: boolean = false;

  private constructor() {
    this.playerId = SessionManager.getOrCreateSessionId(); // Stable across tabs
    this.instanceId = SessionManager.getInstanceId(); // Unique per tab
  }

  static getInstance(): HeartbeatManager {
    if (!HeartbeatManager.instance) {
      HeartbeatManager.instance = new HeartbeatManager();
    }
    return HeartbeatManager.instance;
  }

  start(onDuplicateDetected: () => void): void {
    this.onDuplicateDetected = onDuplicateDetected;
    
    // Send initial heartbeat
    this.sendHeartbeat();
    
    // Send heartbeat every 5 seconds
    this.intervalId = window.setInterval(() => {
      this.sendHeartbeat();
    }, 5000);
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    try {
      const result = await ApiClient.sendHeartbeat(this.playerId, this.instanceId);
      
      if (result.hasDuplicate && this.onDuplicateDetected) {
        this.isShuttingDown = true;
        this.stop();
        this.onDuplicateDetected();
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
      // Continue running even if heartbeat fails to avoid breaking the game
    }
  }
}
