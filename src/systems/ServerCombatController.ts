import { CombatState, AttackResult, WeaponAttack, Enemy } from '../types/GameTypes';
import { ApiClient } from '../utils/ApiClient';

export interface CombatActionResult {
  success: boolean;
  combatState: CombatState;
  combatEnded: boolean;
  sessionId: string;
  result: AttackResult | { success: boolean } | null;
  fled?: boolean;
}

export interface CombatInitResult {
  success: boolean;
  sessionId: string;
  combatState: CombatState;
}

export class ServerCombatController {
  private sessionId: string | null = null;
  private combatState: CombatState | null = null;
  private pendingRequest: boolean = false;
  private onStateUpdate: ((state: CombatState) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  setStateUpdateCallback(callback: (state: CombatState) => void): void {
    this.onStateUpdate = callback;
  }

  setErrorCallback(callback: (error: string) => void): void {
    this.onError = callback;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getCombatState(): CombatState | null {
    return this.combatState;
  }

  isPlayerTurn(): boolean {
    return this.combatState?.currentTurn === 'player';
  }

  isCombatComplete(): boolean {
    return this.combatState?.isComplete || false;
  }

  isRequestPending(): boolean {
    return this.pendingRequest;
  }

  async initiateCombat(
    enemyNames: string[],
    isWildEncounter: boolean = false
  ): Promise<CombatInitResult> {
    this.pendingRequest = true;
    
    try {
      const response = await fetch('/api/combat/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enemyNames,
          isWildEncounter,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to initiate combat: ${response.status}`);
      }

      const data = await response.json();
      
      this.sessionId = data.sessionId;
      this.combatState = data.combatState;
      
      if (this.onStateUpdate && this.combatState) {
        this.onStateUpdate(this.combatState);
      }

      return {
        success: true,
        sessionId: data.sessionId,
        combatState: data.combatState,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (this.onError) {
        this.onError(message);
      }
      throw error;
    } finally {
      this.pendingRequest = false;
    }
  }

  async performAttack(attackName: string, targetId: string): Promise<CombatActionResult> {
    if (!this.sessionId) {
      throw new Error('No active combat session');
    }
    
    if (this.pendingRequest) {
      throw new Error('Request already in progress');
    }

    this.pendingRequest = true;
    
    try {
      const response = await fetch('/api/combat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          action: {
            type: 'attack',
            attackName,
            targetId,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Attack failed: ${response.status}`);
      }

      const data: CombatActionResult = await response.json();
      
      this.combatState = data.combatState;
      
      if (data.combatEnded) {
        this.sessionId = data.sessionId;
      }
      
      if (this.onStateUpdate && this.combatState) {
        this.onStateUpdate(this.combatState);
      }

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (this.onError) {
        this.onError(message);
      }
      throw error;
    } finally {
      this.pendingRequest = false;
    }
  }

  async endTurn(): Promise<CombatActionResult> {
    if (!this.sessionId) {
      throw new Error('No active combat session');
    }
    
    if (this.pendingRequest) {
      throw new Error('Request already in progress');
    }

    this.pendingRequest = true;
    
    try {
      const response = await fetch('/api/combat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          action: {
            type: 'end_turn',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `End turn failed: ${response.status}`);
      }

      const data: CombatActionResult = await response.json();
      
      this.combatState = data.combatState;
      
      if (this.onStateUpdate && this.combatState) {
        this.onStateUpdate(this.combatState);
      }

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (this.onError) {
        this.onError(message);
      }
      throw error;
    } finally {
      this.pendingRequest = false;
    }
  }

  async attemptRun(): Promise<CombatActionResult> {
    if (!this.sessionId) {
      throw new Error('No active combat session');
    }
    
    if (this.pendingRequest) {
      throw new Error('Request already in progress');
    }

    this.pendingRequest = true;
    
    try {
      const response = await fetch('/api/combat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          action: {
            type: 'run',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Run attempt failed: ${response.status}`);
      }

      const data: CombatActionResult = await response.json();
      
      this.combatState = data.combatState;
      this.sessionId = null;
      
      if (this.onStateUpdate && this.combatState) {
        this.onStateUpdate(this.combatState);
      }

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (this.onError) {
        this.onError(message);
      }
      throw error;
    } finally {
      this.pendingRequest = false;
    }
  }

  cleanup(): void {
    this.sessionId = null;
    this.combatState = null;
    this.pendingRequest = false;
  }

  getAvailableAttacks(): WeaponAttack[] {
    return [];
  }

  getEnemies(): Enemy[] {
    return this.combatState?.enemies || [];
  }

  getPlayerHealth(): number {
    return this.combatState?.player?.health || 0;
  }

  getPlayerStamina(): number {
    return this.combatState?.player?.stamina || 0;
  }

  getActionsRemaining(): number {
    return this.combatState?.actionsRemaining || 0;
  }

  getCombatLog(): string[] {
    return this.combatState?.combatLog || [];
  }

  isPlayerVictory(): boolean {
    return this.combatState?.playerVictory || false;
  }
}
