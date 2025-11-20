/**
 * XP & Leveling System
 * 
 * Manages player experience points and level progression.
 * Levels are permanent (persist through death) and range from 1-10.
 * 
 * XP is earned from:
 * - Killing mobs
 * - Killing bosses
 * - Disarming traps
 * - Solving puzzles
 * - Completing delves
 */

/**
 * XP required to reach each level (cumulative totals)
 */
const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 500,
  3: 1500,
  4: 3500,
  5: 7500,
  6: 15500,
  7: 31500,
  8: 63500,
  9: 127500,
  10: 255500,
};

/**
 * XP required to progress from one level to the next
 */
const LEVEL_REQUIREMENTS: Record<number, number> = {
  1: 500,
  2: 1000,
  3: 2000,
  4: 4000,
  5: 8000,
  6: 16000,
  7: 32000,
  8: 64000,
  9: 128000,
};

/**
 * Action types that award XP
 */
export type XpAction = 'mob' | 'boss' | 'trap' | 'puzzle' | 'delveCompletion';

/**
 * XP rewards per tier and action type
 */
const XP_REWARDS: Record<number, Record<XpAction, number>> = {
  1: { // Shallow Ruins
    mob: 5,
    boss: 15,
    trap: 5,
    puzzle: 5,
    delveCompletion: 15,
  },
  2: { // Fungal Hollows
    mob: 8,
    boss: 23,
    trap: 8,
    puzzle: 8,
    delveCompletion: 23,
  },
  3: { // Crystal Groves
    mob: 11,
    boss: 34,
    trap: 11,
    puzzle: 11,
    delveCompletion: 34,
  },
  4: { // The Borderlands
    mob: 17,
    boss: 50,
    trap: 17,
    puzzle: 17,
    delveCompletion: 50,
  },
  5: { // Shattered Forge Core
    mob: 25,
    boss: 75,
    trap: 25,
    puzzle: 25,
    delveCompletion: 75,
  },
};

const MIN_LEVEL = 1;
const MAX_LEVEL = 10;

/**
 * Get the player's current level based on total XP
 * @param totalXp - Player's cumulative XP
 * @returns Current level (1-10)
 */
export function getLevelFromXp(totalXp: number): number {
  if (totalXp < 0) return MIN_LEVEL;
  if (totalXp >= LEVEL_THRESHOLDS[MAX_LEVEL]) return MAX_LEVEL;

  for (let level = MAX_LEVEL; level >= MIN_LEVEL; level--) {
    if (totalXp >= LEVEL_THRESHOLDS[level]) {
      return level;
    }
  }

  return MIN_LEVEL;
}

/**
 * Get the XP required to advance from the given level to the next
 * @param level - Current level
 * @returns XP required for next level, or null if at max level
 */
export function getXpForNextLevel(level: number): number | null {
  const clampedLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
  
  if (clampedLevel >= MAX_LEVEL) {
    return null;
  }

  return LEVEL_REQUIREMENTS[clampedLevel];
}

/**
 * Get the cumulative XP needed to reach a specific level
 * @param level - Target level
 * @returns Total XP required to reach that level
 */
export function getTotalXpForLevel(level: number): number {
  const clampedLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
  return LEVEL_THRESHOLDS[clampedLevel];
}

/**
 * Get the XP reward for a specific action at a given tier
 * @param tier - Delve tier (1-5)
 * @param action - Action type that awards XP
 * @returns XP reward amount
 * @throws Error if tier or action is invalid
 */
export function getXpReward(tier: number, action: XpAction): number {
  if (tier < 1 || tier > 5) {
    throw new Error(`Invalid tier: ${tier}. Must be between 1 and 5.`);
  }

  const tierRewards = XP_REWARDS[tier];
  if (!tierRewards) {
    throw new Error(`No XP rewards defined for tier ${tier}`);
  }

  const reward = tierRewards[action];
  if (reward === undefined) {
    throw new Error(`Invalid action: ${action}`);
  }

  return reward;
}

/**
 * Get the player's progress through their current level
 * @param level - Current level
 * @param totalXp - Player's total XP
 * @returns Object with current XP in level, XP required for next level, and progress percentage (0-1)
 */
export function getLevelProgress(
  level: number,
  totalXp: number
): { current: number; required: number; progress: number } {
  const clampedLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));

  if (clampedLevel >= MAX_LEVEL) {
    return {
      current: 0,
      required: 0,
      progress: 1,
    };
  }

  const levelStartXp = LEVEL_THRESHOLDS[clampedLevel];
  const levelEndXp = LEVEL_THRESHOLDS[clampedLevel + 1];
  const required = levelEndXp - levelStartXp;
  const current = totalXp - levelStartXp;
  const progress = Math.max(0, Math.min(1, current / required));

  return {
    current: Math.max(0, current),
    required,
    progress,
  };
}

/**
 * Check if the player has leveled up after gaining XP
 * @param oldXp - XP before the gain
 * @param newXp - XP after the gain
 * @returns True if player gained at least one level
 */
export function hasLeveledUp(oldXp: number, newXp: number): boolean {
  const oldLevel = getLevelFromXp(oldXp);
  const newLevel = getLevelFromXp(newXp);
  return newLevel > oldLevel;
}

/**
 * Get the new level after gaining XP
 * @param oldXp - XP before the gain
 * @param newXp - XP after the gain
 * @returns New level if leveled up, or null if no level change
 */
export function getNewLevel(oldXp: number, newXp: number): number | null {
  if (hasLeveledUp(oldXp, newXp)) {
    return getLevelFromXp(newXp);
  }
  return null;
}
