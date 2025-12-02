/**
 * Zone Bounds Validation System
 * 
 * Server-authoritative coordinate validation to prevent teleportation exploits.
 * Each zone has defined bounds that the client cannot exceed.
 * 
 * SECURITY: This is a critical anti-cheat system. All coordinates from clients
 * must be validated against these bounds before processing.
 */

import { logSecurityEvent } from '../security';

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  tileSize: number;
}

/**
 * Zone boundary definitions
 * These should match the client-side map dimensions
 * WORLD_SIZE in ExploreScene.ts = 6000 pixels
 * Format: { minX, maxX, minY, maxY, tileSize }
 */
const ZONE_BOUNDS: Record<string, ZoneBounds> = {
  'roboka': {
    minX: 0,
    maxX: 6000,  // Matches WORLD_SIZE in ExploreScene.ts
    minY: 0,
    maxY: 6000,
    tileSize: 32,
  },
  'wilderness': {
    minX: 0,
    maxX: 6000,  // Same world size
    minY: 0,
    maxY: 6000,
    tileSize: 32,
  },
  'fungal_hollows': {
    minX: 0,
    maxX: 6000,
    minY: 0,
    maxY: 6000,
    tileSize: 32,
  },
  'void_wastes': {
    minX: 0,
    maxX: 6000,
    minY: 0,
    maxY: 6000,
    tileSize: 32,
  },
  'crystal_caverns': {
    minX: 0,
    maxX: 6000,
    minY: 0,
    maxY: 6000,
    tileSize: 32,
  },
  'shadow_depths': {
    minX: 0,
    maxX: 6000,
    minY: 0,
    maxY: 6000,
    tileSize: 32,
  },
};

/**
 * Default bounds for unknown zones (generous to avoid false positives)
 * Using 6000 to match standard world size
 */
const DEFAULT_ZONE_BOUNDS: ZoneBounds = {
  minX: 0,
  maxX: 6000,
  minY: 0,
  maxY: 6000,
  tileSize: 32,
};

/**
 * Movement validation constants
 * 
 * These values are tuned based on actual gameplay:
 * - Client moves at 3px/frame, reports every ~500ms
 * - With network latency, movements can batch to 200-600px per report
 * - Setting limits too tight causes false positives during normal play
 */
export const MOVEMENT_LIMITS = {
  MAX_DISTANCE_PER_CALL: 600,      // Max pixels per movement call (allows for network batching)
  MAX_VELOCITY_PER_SECOND: 800,    // Max pixels per second (generous for lag spikes)
  MIN_TIME_BETWEEN_MOVES_MS: 50,   // Minimum time between move calls (prevent spam)
  TELEPORT_THRESHOLD: 1200,        // Distance that triggers teleport detection (obvious cheating only)
};

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  clampedPosition?: { x: number; y: number };
}

/**
 * Validate that a position is within zone bounds
 * Returns valid=true if position is acceptable, or clampedPosition if it was adjusted
 */
export function validatePosition(
  userId: string,
  zoneId: string,
  position: { x: number; y: number }
): ValidationResult {
  // Input validation
  if (typeof position.x !== 'number' || typeof position.y !== 'number') {
    return { valid: false, reason: 'Invalid position type' };
  }
  
  if (isNaN(position.x) || isNaN(position.y)) {
    return { valid: false, reason: 'Position contains NaN' };
  }
  
  if (!isFinite(position.x) || !isFinite(position.y)) {
    return { valid: false, reason: 'Position contains Infinity' };
  }
  
  // Get zone bounds
  const bounds = ZONE_BOUNDS[zoneId] || DEFAULT_ZONE_BOUNDS;
  
  // Check if position is within bounds
  const inBounds = 
    position.x >= bounds.minX && 
    position.x <= bounds.maxX &&
    position.y >= bounds.minY && 
    position.y <= bounds.maxY;
    
  if (inBounds) {
    return { valid: true };
  }
  
  // Position is out of bounds - clamp it
  const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
  const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, position.y));
  
  // Calculate how far out of bounds (for severity determination)
  const outOfBoundsDistance = Math.max(
    Math.abs(position.x - clampedX),
    Math.abs(position.y - clampedY)
  );
  
  // Only log significant out-of-bounds attempts (>100px is suspicious, otherwise just boundary clipping)
  if (outOfBoundsDistance > 100) {
    logSecurityEvent(userId, 'POSITION_OUT_OF_BOUNDS', 'MEDIUM', {
      message: 'Significant position clamping - possible exploit attempt',
      zoneId,
      originalPosition: position,
      clampedPosition: { x: clampedX, y: clampedY },
      outOfBoundsDistance,
    });
  }
  // Minor boundary clipping is normal gameplay and doesn't need logging
  
  return {
    valid: true,
    clampedPosition: { x: clampedX, y: clampedY },
  };
}

/**
 * Validate movement distance between two positions
 * Returns valid=false if movement is suspicious (potential teleport)
 */
export function validateMovementDistance(
  userId: string,
  fromPosition: { x: number; y: number },
  toPosition: { x: number; y: number },
  timeDeltaMs: number
): ValidationResult {
  const dx = toPosition.x - fromPosition.x;
  const dy = toPosition.y - fromPosition.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Check instant teleportation (distance too large for single call)
  if (distance > MOVEMENT_LIMITS.TELEPORT_THRESHOLD) {
    logSecurityEvent(userId, 'TELEPORT_DETECTED', 'CRITICAL', {
      message: 'Possible teleportation exploit detected',
      fromPosition,
      toPosition,
      distance,
      threshold: MOVEMENT_LIMITS.TELEPORT_THRESHOLD,
    });
    return { 
      valid: false, 
      reason: `Movement distance ${Math.round(distance)}px exceeds teleport threshold` 
    };
  }
  
  // Check per-call distance limit
  if (distance > MOVEMENT_LIMITS.MAX_DISTANCE_PER_CALL) {
    logSecurityEvent(userId, 'EXCESSIVE_MOVEMENT', 'HIGH', {
      message: 'Movement distance exceeds per-call limit',
      fromPosition,
      toPosition,
      distance,
      limit: MOVEMENT_LIMITS.MAX_DISTANCE_PER_CALL,
    });
    return { 
      valid: false, 
      reason: `Movement distance ${Math.round(distance)}px exceeds limit of ${MOVEMENT_LIMITS.MAX_DISTANCE_PER_CALL}px` 
    };
  }
  
  // Check velocity (if we have time delta)
  if (timeDeltaMs > 0) {
    const velocityPerSecond = (distance / timeDeltaMs) * 1000;
    
    if (velocityPerSecond > MOVEMENT_LIMITS.MAX_VELOCITY_PER_SECOND) {
      logSecurityEvent(userId, 'SPEED_HACK_DETECTED', 'CRITICAL', {
        message: 'Player moving faster than allowed velocity',
        velocityPerSecond,
        maxVelocity: MOVEMENT_LIMITS.MAX_VELOCITY_PER_SECOND,
        distance,
        timeDeltaMs,
      });
      return { 
        valid: false, 
        reason: `Velocity ${Math.round(velocityPerSecond)}px/s exceeds maximum` 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Combined position and movement validation
 * Use this as the main entry point for movement validation
 */
export function validateMovement(
  userId: string,
  zoneId: string,
  fromPosition: { x: number; y: number } | null,
  toPosition: { x: number; y: number },
  timeDeltaMs: number = 0
): ValidationResult {
  // First validate the target position is in bounds
  const positionResult = validatePosition(userId, zoneId, toPosition);
  if (!positionResult.valid) {
    return positionResult;
  }
  
  // Use clamped position if available
  const validatedPosition = positionResult.clampedPosition || toPosition;
  
  // If we have a previous position, validate movement
  if (fromPosition) {
    const movementResult = validateMovementDistance(
      userId, 
      fromPosition, 
      validatedPosition, 
      timeDeltaMs
    );
    if (!movementResult.valid) {
      return movementResult;
    }
  }
  
  return {
    valid: true,
    clampedPosition: positionResult.clampedPosition,
  };
}

/**
 * Get zone bounds for client synchronization (admin use only)
 */
export function getZoneBounds(zoneId: string): ZoneBounds {
  return ZONE_BOUNDS[zoneId] || DEFAULT_ZONE_BOUNDS;
}

/**
 * Check if a zone ID is valid
 */
export function isValidZone(zoneId: string): boolean {
  return zoneId in ZONE_BOUNDS;
}
