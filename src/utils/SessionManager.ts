// SessionManager handles tab/window instance tracking for multi-instance detection
// Authentication is handled by Replit Auth - no anonymous sessions are supported
export class SessionManager {
  private static instanceId: string | null = null;

  // Returns a unique instance ID for this specific tab/window
  // Used for multi-instance detection to prevent save conflicts
  static getInstanceId(): string {
    if (!this.instanceId) {
      this.instanceId = this.generateInstanceId();
    }
    return this.instanceId;
  }

  private static generateInstanceId(): string {
    return 'inst_' + Math.random().toString(36).substring(2) + 
           Date.now().toString(36) + 
           Math.random().toString(36).substring(2);
  }
}
