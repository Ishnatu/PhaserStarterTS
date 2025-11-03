export class SessionManager {
  private static readonly SESSION_KEY = 'gemforge_session_id';
  private static instanceId: string | null = null;

  // Returns a stable session ID shared across all tabs (used as playerId for anonymous users)
  static getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem(this.SESSION_KEY);
    
    if (!sessionId) {
      sessionId = this.generateSessionId();
      localStorage.setItem(this.SESSION_KEY, sessionId);
    }
    
    return sessionId;
  }

  // Returns a unique instance ID for this specific tab/window
  static getInstanceId(): string {
    if (!this.instanceId) {
      this.instanceId = this.generateSessionId();
    }
    return this.instanceId;
  }

  private static generateSessionId(): string {
    return 'sess_' + Math.random().toString(36).substring(2) + 
           Date.now().toString(36) + 
           Math.random().toString(36).substring(2);
  }

  static clearSession(): void {
    localStorage.removeItem(this.SESSION_KEY);
  }
}
