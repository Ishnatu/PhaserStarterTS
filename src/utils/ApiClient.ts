// API client for authenticated session requests to backend
// All game endpoints require authentication via Replit Auth
import { SessionManager } from './SessionManager';

export class ApiClient {
  private static baseUrl = '';

  static async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies for session auth
      headers: {
        'Content-Type': 'application/json',
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
      // IMPORTANT: Strip currency fields - server manages these authoritatively
      // The save endpoint rejects payloads containing currency to prevent tampering
      const cleanedSaveData = { ...saveData };
      if (cleanedSaveData.player) {
        cleanedSaveData.player = { ...cleanedSaveData.player };
        delete cleanedSaveData.player.arcaneAsh;
        delete cleanedSaveData.player.crystallineAnimus;
      }
      delete cleanedSaveData.arcaneAsh;
      delete cleanedSaveData.crystallineAnimus;
      
      await this.post('/api/game/save', { saveData: cleanedSaveData });
      return true;
    } catch (error) {
      console.error('Failed to save game:', error);
      return false;
    }
  }

  // Heartbeat for multi-instance detection
  // Server derives playerId from authenticated session - no client parameter needed
  static async sendHeartbeat(instanceId: string): Promise<{ hasDuplicate: boolean; activeSessionCount: number }> {
    try {
      const response = await this.post('/api/game/heartbeat', { instanceId });
      return {
        hasDuplicate: response.hasDuplicate || false,
        activeSessionCount: response.activeSessionCount || 1,
      };
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
      return { hasDuplicate: false, activeSessionCount: 1 };
    }
  }

  // Soulbinding API methods
  static async getSoulboundSlots(): Promise<string[] | null> {
    try {
      const response = await this.get('/api/soulbound/slots');
      return response.slots || [];
    } catch (error) {
      console.error('Failed to get soulbound slots:', error);
      return null;  // Return null on error to distinguish from "no bindings"
    }
  }

  static async setSoulboundSlots(slots: string[]): Promise<{ success: boolean; cost?: number; newCA?: number; message?: string }> {
    try {
      const response = await this.post('/api/soulbound/slots', { slots });
      return { success: true, cost: response.cost, newCA: response.newCA };
    } catch (error: any) {
      console.error('Failed to set soulbound slots:', error);
      const message = error.response?.data?.message || 'Failed to save bindings';
      return { success: false, message };
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
  static async getLootedTombstones(): Promise<any[]> {
    try {
      const response = await this.get('/api/karma/looted-tombstones');
      return response.tombstones || [];
    } catch (error) {
      console.error('Failed to get looted tombstones:', error);
      return [];
    }
  }

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
