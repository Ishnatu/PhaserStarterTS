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

// User authentication table - supports both Replit Auth and email/password
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  username: varchar("username").unique(),
  passwordHash: varchar("password_hash"), // Only for email/password auth
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Game save data table - stores the complete player state
// Supports both authenticated users (via userId) and anonymous sessions (via sessionId)
export const gameSaves = pgTable("game_saves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }), // Optional: for authenticated users
  sessionId: varchar("session_id"), // Optional: for anonymous sessions
  saveData: jsonb("save_data").notNull(), // Complete PlayerData object
  lastSaved: timestamp("last_saved").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_game_saves_user_id").on(table.userId),
  index("IDX_game_saves_session_id").on(table.sessionId),
]);

// Tombstones - stores death locations and dropped items
export const tombstones = pgTable("tombstones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id"), // userId or sessionId of the dead player
  ownerName: varchar("owner_name").notNull(), // Display name for "corpse of X"
  worldX: real("world_x").notNull(), // Death location X
  worldY: real("world_y").notNull(), // Death location Y
  items: jsonb("items").notNull(), // Array of items dropped
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // When tombstone disappears
  looted: boolean("looted").default(false).notNull(), // Whether someone has taken the loot
  lootedBy: varchar("looted_by"), // userId/sessionId of the looter
  lootedAt: timestamp("looted_at"), // When it was looted
}, (table) => [
  index("IDX_tombstones_owner").on(table.ownerId),
  index("IDX_tombstones_expires").on(table.expiresAt),
  index("IDX_tombstones_looted").on(table.looted),
]);

// Soulbound items - tracks which equipment slots are soulbound per player
export const soulboundItems = pgTable("soulbound_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(), // userId or sessionId
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
