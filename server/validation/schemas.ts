import { z } from 'zod';

export const TierSchema = z.number().int().min(1).max(5);
export const ItemLocationSchema = z.enum(['equipment', 'inventory', 'footlocker']);
export const CurrencyTypeSchema = z.enum(['AA', 'CA']);

export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const ForgeAttemptSchema = z.object({
  itemLocation: ItemLocationSchema,
  itemIndex: z.number().int().min(0).optional(),
  slotName: z.string().optional(),
}).refine(
  data => data.itemLocation === 'equipment' ? !!data.slotName : typeof data.itemIndex === 'number',
  { message: 'Equipment requires slotName, inventory/footlocker requires itemIndex' }
);

export const RepairAttemptSchema = z.object({
  itemLocation: z.enum(['equipment', 'inventory']),
  itemIndex: z.number().int().min(0).optional(),
  slotName: z.string().optional(),
  currency: CurrencyTypeSchema,
}).refine(
  data => data.itemLocation === 'equipment' ? !!data.slotName : typeof data.itemIndex === 'number',
  { message: 'Equipment requires slotName, inventory requires itemIndex' }
);

export const ShopPurchaseSchema = z.object({
  itemId: z.string().min(1).max(100),
  price: z.number().int().positive(),
  currency: CurrencyTypeSchema,
});

export const WildernessEncounterSchema = z.object({
  tier: TierSchema,
  enemyCount: z.number().int().min(1).max(5),
  hasBoss: z.boolean().optional(),
});

export const TreasureSessionSchema = z.object({
  type: z.enum(['treasure', 'shrine']),
  tier: TierSchema.optional(),
});

export const CombatInitiateSchema = z.object({
  enemyNames: z.array(z.string().min(1).max(100)).min(1).max(5),
  isWildEncounter: z.boolean().optional(),
});

export const CombatActionSchema = z.object({
  sessionId: z.string().min(1).max(200),
  actionType: z.enum(['attack', 'endTurn', 'useItem', 'flee']),
  targetIndex: z.number().int().min(0).max(4).optional(),
  attackSlot: z.number().int().min(0).max(3).optional(),
  itemIndex: z.number().int().min(0).optional(),
});

export const LootRollSchema = z.object({
  sessionId: z.string().min(1).max(200),
  enemyName: z.string().min(1).max(100).optional(),
  tier: TierSchema.optional(),
  isBoss: z.boolean().optional(),
  playerLevel: z.number().int().min(1).max(10).optional(),
});

export const DelveGenerateSchema = z.object({
  tier: TierSchema,
});

export const DelveCompleteSchema = z.object({
  sessionId: z.string().min(1).max(200),
});

export const DelveTrapSchema = z.object({
  tier: TierSchema,
});

export const DelveTreasureSchema = z.object({
  tier: TierSchema,
  sessionId: z.string().max(200).optional(),
  roomId: z.string().max(100).optional(),
});

export const ExplorationMoveSchema = z.object({
  zoneId: z.string().min(1).max(100),
  position: PositionSchema,
  encounterRateMultiplier: z.number().positive().max(3).optional(),
});

export const EncounterTokenSchema = z.object({
  encounterToken: z.string().min(1).max(200),
});

export const TrapAttemptSchema = z.object({
  encounterToken: z.string().min(1).max(200),
});

export const TreasureClaimSchema = z.object({
  encounterToken: z.string().min(1).max(200),
  combatVictory: z.boolean().optional(),
  combatSessionId: z.string().max(200).optional(),
});

export const ShrineOfferSchema = z.object({
  encounterToken: z.string().min(1).max(200),
  offerAmount: z.number().int().positive(),
});

export const HeartbeatSchema = z.object({
  instanceId: z.string().min(1).max(200),
});

export const SoulboundSlotsSchema = z.object({
  slots: z.array(
    z.enum(['mainHand', 'offHand', 'helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape'])
  ).max(3),
});

export const TombstoneCreateSchema = z.object({
  ownerName: z.string().min(1).max(50),
  worldX: z.number().finite(),
  worldY: z.number().finite(),
  items: z.array(z.unknown()).max(10),
  expiresInHours: z.number().int().min(1).max(168).optional(),
});

export const KarmaReturnSchema = z.object({
  originalOwnerId: z.string().min(1).max(200),
  returnerName: z.string().min(1).max(50),
  items: z.array(z.unknown()).max(10),
});

export const ChallengeVerifySchema = z.object({
  response: z.string().min(1).max(100),
  responseTimeMs: z.number().positive().optional(),
});

export const SecurityViolationSchema = z.object({
  type: z.string().min(1).max(100),
  details: z.string().max(1000).optional(),
  timestamp: z.number().optional(),
  violations: z.number().int().optional(),
});

export type ForgeAttempt = z.infer<typeof ForgeAttemptSchema>;
export type RepairAttempt = z.infer<typeof RepairAttemptSchema>;
export type ShopPurchase = z.infer<typeof ShopPurchaseSchema>;
export type WildernessEncounter = z.infer<typeof WildernessEncounterSchema>;
export type CombatInitiate = z.infer<typeof CombatInitiateSchema>;
export type CombatAction = z.infer<typeof CombatActionSchema>;
export type LootRoll = z.infer<typeof LootRollSchema>;
