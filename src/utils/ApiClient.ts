// API client for both authenticated and anonymous session requests to backend
import { SessionManager } from './SessionManager';

export class ApiClient {
  private static baseUrl = '';

  static async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Include session ID in headers for anonymous users
    const sessionId = SessionManager.getOrCreateSessionId();
    
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies for session auth (if authenticated)
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId, // Send session ID for anonymous sessions
        ...options.headers,
      },
    });

    return response;
  }

  static async get(endpoint: string): Promise<any> {
    const response = await this.fetch(endpoint);
    if (!response.ok) {
      throw new Error(`GET ${endpoint} failed: ${response.statusText}`);
    }
    return response.json();
  }

  static async post(endpoint: string, data: any): Promise<any> {
    const response = await this.fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`POST ${endpoint} failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Check if user is authenticated
  static async checkAuth(): Promise<{ isAuthenticated: boolean; user?: any }> {
    try {
      const user = await this.get('/api/auth/user');
      return { isAuthenticated: true, user };
    } catch (error) {
      return { isAuthenticated: false };
    }
  }

  // Load game save from server
  static async loadGame(): Promise<any> {
    try {
      const response = await this.get('/api/game/load');
      return response.saveData;
    } catch (error) {
      console.error('Failed to load game:', error);
      return null;
    }
  }

  // Save game state to server
  static async saveGame(saveData: any): Promise<boolean> {
    try {
      await this.post('/api/game/save', { saveData });
      return true;
    } catch (error) {
      console.error('Failed to save game:', error);
      return false;
    }
  }

  // Soulbinding API methods
  static async getSoulboundSlots(): Promise<string[]> {
    try {
      const response = await this.get('/api/soulbound/slots');
      return response.slots || [];
    } catch (error) {
      console.error('Failed to get soulbound slots:', error);
      return [];
    }
  }

  static async setSoulboundSlots(slots: string[]): Promise<boolean> {
    try {
      await this.post('/api/soulbound/slots', { slots });
      return true;
    } catch (error) {
      console.error('Failed to set soulbound slots:', error);
      return false;
    }
  }

  // Tombstone API methods
  static async createTombstone(data: {
    ownerName: string;
    worldX: number;
    worldY: number;
    items: any[];
    expiresInHours?: number;
  }): Promise<any> {
    try {
      const response = await this.post('/api/tombstones/create', data);
      return response.tombstone;
    } catch (error) {
      console.error('Failed to create tombstone:', error);
      return null;
    }
  }

  static async getMyTombstones(): Promise<any[]> {
    try {
      const response = await this.get('/api/tombstones/mine');
      return response.tombstones || [];
    } catch (error) {
      console.error('Failed to get tombstones:', error);
      return [];
    }
  }

  static async getRandomTombstone(): Promise<any> {
    try {
      const response = await this.get('/api/tombstones/random');
      return response.tombstone;
    } catch (error) {
      console.error('Failed to get random tombstone:', error);
      return null;
    }
  }

  static async lootTombstone(tombstoneId: string): Promise<{ success: boolean; items?: any[] }> {
    try {
      const response = await this.post(`/api/tombstones/${tombstoneId}/loot`, {});
      return { success: true, items: response.items };
    } catch (error) {
      console.error('Failed to loot tombstone:', error);
      return { success: false };
    }
  }

  static async deleteTombstone(tombstoneId: string): Promise<boolean> {
    try {
      const response = await this.fetch(`/api/tombstones/${tombstoneId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to delete tombstone:', error);
      return false;
    }
  }

  // Karma API methods
  static async returnLoot(data: {
    originalOwnerId: string;
    returnerName: string;
    items: any[];
  }): Promise<boolean> {
    try {
      await this.post('/api/karma/return', data);
      return true;
    } catch (error) {
      console.error('Failed to return loot:', error);
      return false;
    }
  }

  static async getPendingReturns(): Promise<any[]> {
    try {
      const response = await this.get('/api/karma/pending');
      return response.pending || [];
    } catch (error) {
      console.error('Failed to get pending returns:', error);
      return [];
    }
  }

  static async claimReturnedLoot(lootId: string): Promise<any> {
    try {
      const response = await this.post(`/api/karma/claim/${lootId}`, {});
      return response.claimed;
    } catch (error) {
      console.error('Failed to claim returned loot:', error);
      return null;
    }
  }

  static async getKarmaLeaderboard(limit: number = 10): Promise<{ playerName: string; totalItems: number }[]> {
    try {
      const response = await this.get(`/api/karma/leaderboard?limit=${limit}`);
      return response.leaderboard || [];
    } catch (error) {
      console.error('Failed to get karma leaderboard:', error);
      return [];
    }
  }
}
