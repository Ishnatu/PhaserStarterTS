export class SessionManager {
  private static readonly SESSION_KEY = 'gemforge_session_id';

  static getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem(this.SESSION_KEY);
    
    if (!sessionId) {
      sessionId = this.generateSessionId();
      localStorage.setItem(this.SESSION_KEY, sessionId);
    }
    
    return sessionId;
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
