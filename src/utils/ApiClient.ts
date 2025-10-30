// API client for authenticated requests to backend
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
      await this.post('/api/game/save', { saveData });
      return true;
    } catch (error) {
      console.error('Failed to save game:', error);
      return false;
    }
  }
}
