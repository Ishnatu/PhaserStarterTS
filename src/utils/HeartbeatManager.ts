import { ApiClient } from './ApiClient';
import { SessionManager } from './SessionManager';

export class HeartbeatManager {
  private static instance: HeartbeatManager;
  private intervalId: number | null = null;
  private playerId: string = ''; // Set by authenticated user - REQUIRED
  private instanceId: string; // Unique ID for this tab
  private onDuplicateDetected: (() => void) | null = null;
  private onHeartbeatStopped: (() => void) | null = null; // Callback to re-arm watchdog
  private isShuttingDown: boolean = false;

  private constructor() {
    this.instanceId = SessionManager.getInstanceId(); // Unique per tab
  }
  
  setPlayerId(playerId: string): void {
    if (!playerId || typeof playerId !== 'string' || playerId.trim() === '') {
      console.error('[SECURITY] HeartbeatManager: Attempted to set invalid playerId');
      return;
    }
    this.playerId = playerId;
  }
  
  // Check if heartbeat is currently running
  isRunning(): boolean {
    return this.intervalId !== null && !this.isShuttingDown;
  }

  static getInstance(): HeartbeatManager {
    if (!HeartbeatManager.instance) {
      HeartbeatManager.instance = new HeartbeatManager();
    }
    return HeartbeatManager.instance;
  }

  start(onDuplicateDetected: () => void, onHeartbeatStopped?: () => void): boolean {
    // SECURITY: Refuse to start heartbeat without valid playerId
    if (!this.playerId || this.playerId.trim() === '') {
      console.error('[SECURITY] HeartbeatManager.start() called without valid playerId - refusing to start');
      return false;
    }
    
    // Already running - don't restart
    if (this.intervalId !== null) {
      return true;
    }
    
    this.onDuplicateDetected = onDuplicateDetected;
    this.onHeartbeatStopped = onHeartbeatStopped || null;
    this.isShuttingDown = false;
    
    // Send initial heartbeat
    this.sendHeartbeat();
    
    // Send heartbeat every 5 seconds
    this.intervalId = window.setInterval(() => {
      this.sendHeartbeat();
    }, 5000);
    
    return true;
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  // Internal stop with re-arm callback for recovery
  private stopAndNotify(): void {
    this.stop();
    // Notify watchdog to re-arm
    if (this.onHeartbeatStopped) {
      this.onHeartbeatStopped();
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    
    // SECURITY: Refuse to send heartbeat without valid playerId
    // Use stopAndNotify to re-arm watchdog for recovery
    if (!this.playerId || this.playerId.trim() === '') {
      console.error('[SECURITY] sendHeartbeat called with invalid playerId - aborting and notifying watchdog');
      this.stopAndNotify();
      return;
    }

    try {
      const result = await ApiClient.sendHeartbeat(this.instanceId);
      
      if (result.hasDuplicate && this.onDuplicateDetected) {
        this.isShuttingDown = true;
        this.stop(); // Don't notify - this is intentional shutdown
        this.onDuplicateDetected();
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
      // Continue running even if heartbeat fails to avoid breaking the game
    }
  }
}
