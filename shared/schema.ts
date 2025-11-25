import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  timestamp,
  varchar,
  text,
  boolean,
  unique,
  check,
} from "drizzle-orm/pg-core";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User authentication table - Replit Auth only
export const users = pgTable("users", {
  id: varchar("id").primaryKey(), // Replit Auth user ID (sub claim)
  username: varchar("username").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Game save data table - stores the complete player state (Replit Auth only)
export const gameSaves = pgTable("game_saves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  saveData: jsonb("save_data").notNull(), // Complete PlayerData object
  lastSaved: timestamp("last_saved").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_game_saves_user_id").on(table.userId),
]);

// Tombstones - stores death locations and dropped items (Replit Auth only)
export const tombstones = pgTable("tombstones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(), // userId of the dead player
  ownerName: varchar("owner_name").notNull(), // Display name for "corpse of X"
  worldX: real("world_x").notNull(), // Death location X
  worldY: real("world_y").notNull(), // Death location Y
  items: jsonb("items").notNull(), // Array of items dropped
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // When tombstone disappears
  looted: boolean("looted").default(false).notNull(), // Whether someone has taken the loot
  lootedBy: varchar("looted_by"), // userId of the looter
  lootedAt: timestamp("looted_at"), // When it was looted
}, (table) => [
  index("IDX_tombstones_owner").on(table.ownerId),
  index("IDX_tombstones_expires").on(table.expiresAt),
  index("IDX_tombstones_looted").on(table.looted),
]);

// Soulbound items - tracks which equipment slots are soulbound per player (Replit Auth only)
export const soulboundItems = pgTable("soulbound_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(), // userId
  slotName: varchar("slot_name").notNull(), // e.g., "mainHand", "chest", etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_soulbound_player").on(table.playerId),
]);

// Returned loot - items being returned to original owner via karma system
export const returnedLoot = pgTable("returned_loot", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalOwnerId: varchar("original_owner_id").notNull(), // Who lost the items
  returnedById: varchar("returned_by_id").notNull(), // Who returned them
  returnerName: varchar("returner_name").notNull(), // Name to display in notification
  items: jsonb("items").notNull(), // Array of items being returned
  claimed: boolean("claimed").default(false).notNull(), // Whether owner has claimed from Halls of Virtue
  createdAt: timestamp("created_at").defaultNow().notNull(),
  claimedAt: timestamp("claimed_at"),
}, (table) => [
  index("IDX_returned_loot_owner").on(table.originalOwnerId),
  index("IDX_returned_loot_claimed").on(table.claimed),
]);

// Karma events - tracks karma points for leaderboard
export const karmaEvents = pgTable("karma_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(), // Who earned karma
  playerName: varchar("player_name").notNull(), // Display name for leaderboard
  itemCount: integer("item_count").notNull(), // How many items returned
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_karma_events_player").on(table.playerId),
]);

// Player state - server-authoritative player data (cannot be tampered by client)
// This table stores all values that must be protected from client manipulation
export const playerCurrencies = pgTable("player_currencies", {
  playerId: varchar("player_id").primaryKey(), // userId
  arcaneAsh: integer("arcane_ash").default(0).notNull(),
  crystallineAnimus: integer("crystalline_animus").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  experience: integer("experience").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_player_currencies_player").on(table.playerId),
]);

// Withdrawal requests - tracks nonces and signatures to prevent replay attacks
export const playerWithdrawals = pgTable("player_withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(), // userId
  walletAddress: varchar("wallet_address").notNull(), // Ronin wallet address
  currencyType: varchar("currency_type").notNull(), // 'arcaneAsh' or 'crystallineAnimus'
  amount: integer("amount").notNull(),
  nonce: integer("nonce").notNull(), // Monotonic nonce per player - UNIQUE per player!
  signature: text("signature"), // EIP-712 signature (null until generated)
  expiresAt: timestamp("expires_at"), // Signature expiry (15 minutes from generation)
  status: varchar("status").notNull().default("pending"), // pending, signed, claimed, expired, cancelled
  claimedTxHash: varchar("claimed_tx_hash"), // Ronin transaction hash when claimed
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("withdrawal_player_nonce_unique").on(table.playerId, table.nonce),
  check("withdrawal_amount_positive", sql`${table.amount} > 0`),
  index("IDX_withdrawals_player").on(table.playerId),
  index("IDX_withdrawals_status").on(table.status),
  index("IDX_withdrawals_player_status_created").on(table.playerId, table.status, table.createdAt),
  index("IDX_withdrawals_wallet").on(table.walletAddress),
]);

// Security audit log - tracks all security-sensitive events
export const securityAuditLog = pgTable("security_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(), // withdrawal_request, withdrawal_claimed, forge_attempt, marketplace_trade, admin_action
  playerId: varchar("player_id"), // Optional - not all events have a player
  sessionId: varchar("session_id"), // Session identifier for tracking user sessions
  metadata: jsonb("metadata").notNull(), // Event-specific data (amounts, item IDs, etc.)
  ipAddress: varchar("ip_address"), // Note: Hash or anonymize for GDPR compliance
  userAgent: text("user_agent"), // Note: Hash or anonymize for GDPR compliance
  severity: varchar("severity").notNull().default("info"), // info, warning, critical
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_audit_log_player_created").on(table.playerId, table.createdAt),
  index("IDX_audit_log_event_type").on(table.eventType),
  index("IDX_audit_log_severity").on(table.severity),
]);

// Forge attempts - tracks forging patterns for anomaly detection
export const forgeAttempts = pgTable("forge_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(),
  itemId: varchar("item_id").notNull(), // Item being forged
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  success: boolean("success").notNull(),
  costArcaneAsh: integer("cost_arcane_ash").notNull(),
  costCrystallineAnimus: integer("cost_crystalline_animus").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_forge_player_created").on(table.playerId, table.createdAt),
  index("IDX_forge_success").on(table.success),
]);

// Marketplace trades - tracks trading activity for wash trading detection
export const marketplaceTrades = pgTable("marketplace_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull(),
  buyerId: varchar("buyer_id"),
  itemId: varchar("item_id").notNull(),
  itemType: varchar("item_type").notNull(), // weapon, armor, potion, etc.
  listingPrice: integer("listing_price").notNull(),
  currencyType: varchar("currency_type").notNull(), // arcaneAsh or crystallineAnimus
  status: varchar("status").notNull().default("listed"), // listed, sold, cancelled
  soldAt: timestamp("sold_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  check("marketplace_price_positive", sql`${table.listingPrice} > 0`),
  index("IDX_marketplace_seller_buyer_created").on(table.sellerId, table.buyerId, table.createdAt),
  index("IDX_marketplace_status").on(table.status),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type GameSave = typeof gameSaves.$inferSelect;
export type InsertGameSave = typeof gameSaves.$inferInsert;
export type Tombstone = typeof tombstones.$inferSelect;
export type InsertTombstone = typeof tombstones.$inferInsert;
export type SoulboundItem = typeof soulboundItems.$inferSelect;
export type InsertSoulboundItem = typeof soulboundItems.$inferInsert;
export type ReturnedLoot = typeof returnedLoot.$inferSelect;
export type InsertReturnedLoot = typeof returnedLoot.$inferInsert;
export type KarmaEvent = typeof karmaEvents.$inferSelect;
export type InsertKarmaEvent = typeof karmaEvents.$inferInsert;
export type PlayerCurrency = typeof playerCurrencies.$inferSelect;
export type InsertPlayerCurrency = typeof playerCurrencies.$inferInsert;
export type PlayerWithdrawal = typeof playerWithdrawals.$inferSelect;
export type InsertPlayerWithdrawal = typeof playerWithdrawals.$inferInsert;
export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type InsertSecurityAuditLog = typeof securityAuditLog.$inferInsert;
export type ForgeAttempt = typeof forgeAttempts.$inferSelect;
export type InsertForgeAttempt = typeof forgeAttempts.$inferInsert;
export type MarketplaceTrade = typeof marketplaceTrades.$inferSelect;
export type InsertMarketplaceTrade = typeof marketplaceTrades.$inferInsert;
