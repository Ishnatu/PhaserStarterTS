export interface ForgingTier {
  successChance: number;
  failureResult: 'no_change' | 'downgrade';
  destructionChance: number;
  costAA: number;
  costCA: number;
}

export const FORGING_TIERS: Map<number, ForgingTier> = new Map([
  [1, { successChance: 0.95, failureResult: 'no_change', destructionChance: 0, costAA: 100, costCA: 1 }],
  [2, { successChance: 0.85, failureResult: 'no_change', destructionChance: 0, costAA: 250, costCA: 2 }],
  [3, { successChance: 0.70, failureResult: 'downgrade', destructionChance: 0, costAA: 400, costCA: 4 }],
  [4, { successChance: 0.60, failureResult: 'downgrade', destructionChance: 0, costAA: 600, costCA: 8 }],
  [5, { successChance: 0.45, failureResult: 'downgrade', destructionChance: 0.10, costAA: 900, costCA: 16 }],
  [6, { successChance: 0.35, failureResult: 'downgrade', destructionChance: 0.15, costAA: 1300, costCA: 32 }],
  [7, { successChance: 0.25, failureResult: 'downgrade', destructionChance: 0.25, costAA: 2000, costCA: 64 }],
  [8, { successChance: 0.15, failureResult: 'downgrade', destructionChance: 0.35, costAA: 3000, costCA: 128 }],
  [9, { successChance: 0.10, failureResult: 'downgrade', destructionChance: 0.50, costAA: 5000, costCA: 256 }],
]);

export const MAX_ENHANCEMENT_LEVEL = 9;
export const BASE_ITEM_DURABILITY = 100;

export function getShinyChance(targetLevel: number): number {
  if (targetLevel <= 0 || targetLevel > 9) return 0;
  if (targetLevel <= 4) return 0.005;
  if (targetLevel === 5) return 0.0075;
  if (targetLevel === 6) return 0.01;
  if (targetLevel === 7) return 0.0125;
  if (targetLevel === 8) return 0.015;
  if (targetLevel === 9) return 0.0175;
  return 0;
}

export function getForgingCost(targetLevel: number): { aa: number; ca: number } | null {
  const tier = FORGING_TIERS.get(targetLevel);
  if (!tier) return null;
  return { aa: tier.costAA, ca: tier.costCA };
}
