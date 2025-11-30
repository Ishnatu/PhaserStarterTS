import { SeededRNG } from '../utils/SeededRNG';
import { logSecurityEvent } from '../security';

export type EncounterType = 
  | 'combat' 
  | 'treasure' 
  | 'shrine' 
  | 'corrupted_void_portal' 
  | 'trapped_chest' 
  | 'tombstone' 
  | 'wandering_merchant';

export interface PendingEncounter {
  token: string;
  type: EncounterType;
  userId: string;
  zoneId: string;
  position: { x: number; y: number };
  createdAt: number;
  consumed: boolean;
  metadata?: Record<string, any>;
}

interface UserExplorationState {
  lastPosition: { x: number; y: number };
  stepCounter: number;
  lastMoveTimestamp: number;
  encounterCooldownUntil: number;
}

const ENCOUNTER_STEP_THRESHOLD = 10;
const BASE_ENCOUNTER_CHANCE = 0.15;
const ENCOUNTER_EXPIRY_MS = 5 * 60 * 1000;
const ENCOUNTER_COOLDOWN_MS = 3000;
const MAX_MOVE_DISTANCE_PER_CALL = 200;

class PendingEncounterManager {
  private pendingEncounters = new Map<string, PendingEncounter>();
  private userExplorationState = new Map<string, UserExplorationState>();
  
  constructor() {
    setInterval(() => this.cleanup(), 60 * 1000);
  }
  
  private hashStringToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [token, encounter] of this.pendingEncounters) {
      if (now - encounter.createdAt > ENCOUNTER_EXPIRY_MS) {
        this.pendingEncounters.delete(token);
      }
    }
    for (const [userId, state] of this.userExplorationState) {
      if (now - state.lastMoveTimestamp > 10 * 60 * 1000) {
        this.userExplorationState.delete(userId);
      }
    }
  }
  
  private generateToken(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return 'enc_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  private generateEncounterType(rng: SeededRNG, zoneId: string): EncounterType {
    const roll = rng.next();
    
    if (roll < 0.38) {
      return 'combat';
    } else if (roll < 0.58) {
      return 'combat';
    } else if (roll < 0.73) {
      return 'treasure';
    } else if (roll < 0.83) {
      return 'shrine';
    } else if (roll < 0.93) {
      return 'corrupted_void_portal';
    } else if (roll < 0.98) {
      return 'trapped_chest';
    } else if (roll < 0.99) {
      return 'tombstone';
    } else {
      return 'wandering_merchant';
    }
  }
  
  processMovement(
    userId: string, 
    zoneId: string, 
    position: { x: number; y: number },
    encounterRateMultiplier: number = 1.0
  ): { encounter: PendingEncounter | null; stateUpdate: { stepCounter: number } } {
    const now = Date.now();
    
    let state = this.userExplorationState.get(userId);
    if (!state) {
      state = {
        lastPosition: position,
        stepCounter: 0,
        lastMoveTimestamp: now,
        encounterCooldownUntil: 0,
      };
      this.userExplorationState.set(userId, state);
      return { encounter: null, stateUpdate: { stepCounter: 0 } };
    }
    
    const dx = position.x - state.lastPosition.x;
    const dy = position.y - state.lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > MAX_MOVE_DISTANCE_PER_CALL) {
      logSecurityEvent(userId, 'SUSPICIOUS_MOVEMENT', 'MEDIUM', {
        message: 'Unusually large movement distance detected',
        distance,
        from: state.lastPosition,
        to: position,
      });
      state.lastPosition = position;
      state.lastMoveTimestamp = now;
      return { encounter: null, stateUpdate: { stepCounter: state.stepCounter } };
    }
    
    const steps = Math.floor(distance / 32);
    state.stepCounter += steps;
    state.lastPosition = position;
    state.lastMoveTimestamp = now;
    
    if (now < state.encounterCooldownUntil) {
      return { encounter: null, stateUpdate: { stepCounter: state.stepCounter } };
    }
    
    if (state.stepCounter < ENCOUNTER_STEP_THRESHOLD) {
      return { encounter: null, stateUpdate: { stepCounter: state.stepCounter } };
    }
    
    const seedStr = `${userId}-${zoneId}-${now}-${position.x}-${position.y}`;
    const seedNum = this.hashStringToNumber(seedStr);
    const rng = new SeededRNG(seedNum);
    const adjustedChance = BASE_ENCOUNTER_CHANCE * encounterRateMultiplier;
    
    if (rng.next() < adjustedChance) {
      state.stepCounter = 0;
      state.encounterCooldownUntil = now + ENCOUNTER_COOLDOWN_MS;
      
      const encounterType = this.generateEncounterType(rng, zoneId);
      const token = this.generateToken();
      
      const encounter: PendingEncounter = {
        token,
        type: encounterType,
        userId,
        zoneId,
        position: { ...position },
        createdAt: now,
        consumed: false,
      };
      
      this.pendingEncounters.set(token, encounter);
      
      console.log(`[ENCOUNTER] Generated ${encounterType} encounter for user ${userId} at (${position.x}, ${position.y})`);
      
      return { encounter, stateUpdate: { stepCounter: 0 } };
    }
    
    return { encounter: null, stateUpdate: { stepCounter: state.stepCounter } };
  }
  
  validateAndConsumeEncounter(token: string, userId: string, expectedType?: EncounterType): PendingEncounter | null {
    const encounter = this.pendingEncounters.get(token);
    
    if (!encounter) {
      logSecurityEvent(userId, 'INVALID_ENCOUNTER_TOKEN', 'MEDIUM', {
        message: 'Attempted to use non-existent encounter token',
        token: token.substring(0, 10) + '...',
      });
      return null;
    }
    
    if (encounter.userId !== userId) {
      logSecurityEvent(userId, 'ENCOUNTER_TOKEN_MISMATCH', 'HIGH', {
        message: 'Attempted to use another user\'s encounter token',
        tokenOwner: encounter.userId,
      });
      return null;
    }
    
    if (encounter.consumed) {
      logSecurityEvent(userId, 'ENCOUNTER_ALREADY_CONSUMED', 'HIGH', {
        message: 'Attempted to reuse consumed encounter token',
        token: token.substring(0, 10) + '...',
        type: encounter.type,
      });
      return null;
    }
    
    const now = Date.now();
    if (now - encounter.createdAt > ENCOUNTER_EXPIRY_MS) {
      logSecurityEvent(userId, 'ENCOUNTER_EXPIRED', 'LOW', {
        message: 'Attempted to use expired encounter token',
        age: now - encounter.createdAt,
      });
      this.pendingEncounters.delete(token);
      return null;
    }
    
    if (expectedType && encounter.type !== expectedType) {
      logSecurityEvent(userId, 'ENCOUNTER_TYPE_MISMATCH', 'HIGH', {
        message: 'Encounter type mismatch',
        expected: expectedType,
        actual: encounter.type,
      });
      return null;
    }
    
    encounter.consumed = true;
    
    return encounter;
  }
  
  getPendingEncounter(token: string): PendingEncounter | null {
    return this.pendingEncounters.get(token) || null;
  }
  
  hasPendingEncounterOfType(userId: string, type: EncounterType): PendingEncounter | null {
    for (const encounter of this.pendingEncounters.values()) {
      if (encounter.userId === userId && encounter.type === type && !encounter.consumed) {
        return encounter;
      }
    }
    return null;
  }
  
  clearUserEncounters(userId: string): void {
    for (const [token, encounter] of this.pendingEncounters) {
      if (encounter.userId === userId) {
        this.pendingEncounters.delete(token);
      }
    }
  }
  
  resetUserExplorationState(userId: string): void {
    this.userExplorationState.delete(userId);
  }
  
  getStats(): { pendingEncounters: number; activeUsers: number } {
    return {
      pendingEncounters: this.pendingEncounters.size,
      activeUsers: this.userExplorationState.size,
    };
  }
}

export const pendingEncounterManager = new PendingEncounterManager();
