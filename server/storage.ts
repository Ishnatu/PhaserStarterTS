// Storage layer for database operations
import {
  users,
  gameSaves,
  tombstones,
  soulboundItems,
  returnedLoot,
  karmaEvents,
  type User,
  type UpsertUser,
  type GameSave,
  type InsertGameSave,
  type Tombstone,
  type InsertTombstone,
  type SoulboundItem,
  type InsertSoulboundItem,
  type ReturnedLoot,
  type InsertReturnedLoot,
  type KarmaEvent,
  type InsertKarmaEvent,
} from "../shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, sql as drizzleSql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Game save operations - supports both authenticated and anonymous sessions
  getGameSaveByUserId(userId: string): Promise<GameSave | undefined>;
  getGameSaveBySessionId(sessionId: string): Promise<GameSave | undefined>;
  saveGame(save: InsertGameSave): Promise<GameSave>;
  
  // Soulbinding operations
  getSoulboundSlots(playerId: string): Promise<SoulboundItem[]>;
  setSoulboundSlots(playerId: string, slots: string[]): Promise<void>;
  removeSoulboundSlot(playerId: string, slotName: string): Promise<void>;
  
  // Tombstone operations
  createTombstone(tombstone: InsertTombstone): Promise<Tombstone>;
  getPlayerTombstones(playerId: string): Promise<Tombstone[]>;
  getRandomTombstone(playerId: string): Promise<Tombstone | undefined>;
  getTombstoneById(tombstoneId: string): Promise<Tombstone | undefined>;
  markTombstoneLooted(tombstoneId: string, lootedBy: string): Promise<void>;
  deleteTombstone(tombstoneId: string): Promise<void>;
  cleanupExpiredTombstones(): Promise<number>;
  
  // Karma/Return operations
  createReturnedLoot(loot: InsertReturnedLoot): Promise<ReturnedLoot>;
  getPendingReturns(playerId: string): Promise<ReturnedLoot[]>;
  claimReturnedLoot(lootId: string): Promise<ReturnedLoot>;
  addKarmaEvent(event: InsertKarmaEvent): Promise<KarmaEvent>;
  getKarmaLeaderboard(limit: number): Promise<{ playerName: string; totalItems: number }[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Game save operations - supports both authenticated and anonymous sessions
  async getGameSaveByUserId(userId: string): Promise<GameSave | undefined> {
    const [save] = await db
      .select()
      .from(gameSaves)
      .where(eq(gameSaves.userId, userId))
      .orderBy(desc(gameSaves.lastSaved))
      .limit(1);
    return save;
  }

  async getGameSaveBySessionId(sessionId: string): Promise<GameSave | undefined> {
    const [save] = await db
      .select()
      .from(gameSaves)
      .where(eq(gameSaves.sessionId, sessionId))
      .orderBy(desc(gameSaves.lastSaved))
      .limit(1);
    return save;
  }

  async saveGame(saveData: InsertGameSave): Promise<GameSave> {
    // Upsert logic: find existing save by userId OR sessionId, then update or insert
    let existing: GameSave | undefined;
    
    if (saveData.userId) {
      existing = await this.getGameSaveByUserId(saveData.userId);
    } else if (saveData.sessionId) {
      existing = await this.getGameSaveBySessionId(saveData.sessionId);
    }
    
    if (existing) {
      const [updated] = await db
        .update(gameSaves)
        .set({
          saveData: saveData.saveData,
          lastSaved: new Date(),
        })
        .where(eq(gameSaves.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(gameSaves)
        .values(saveData)
        .returning();
      return created;
    }
  }

  // Soulbinding operations
  async getSoulboundSlots(playerId: string): Promise<SoulboundItem[]> {
    return await db
      .select()
      .from(soulboundItems)
      .where(eq(soulboundItems.playerId, playerId));
  }

  async setSoulboundSlots(playerId: string, slots: string[]): Promise<void> {
    // Delete all existing soulbound slots for this player
    await db.delete(soulboundItems).where(eq(soulboundItems.playerId, playerId));
    
    // Insert new soulbound slots
    if (slots.length > 0) {
      await db.insert(soulboundItems).values(
        slots.map(slotName => ({
          playerId,
          slotName,
        }))
      );
    }
  }

  async removeSoulboundSlot(playerId: string, slotName: string): Promise<void> {
    await db.delete(soulboundItems).where(
      and(
        eq(soulboundItems.playerId, playerId),
        eq(soulboundItems.slotName, slotName)
      )
    );
  }

  // Tombstone operations
  async createTombstone(tombstoneData: InsertTombstone): Promise<Tombstone> {
    const [tombstone] = await db
      .insert(tombstones)
      .values(tombstoneData)
      .returning();
    return tombstone;
  }

  async getPlayerTombstones(playerId: string): Promise<Tombstone[]> {
    return await db
      .select()
      .from(tombstones)
      .where(
        and(
          eq(tombstones.ownerId, playerId),
          eq(tombstones.looted, false)
        )
      );
  }

  async getRandomTombstone(playerId: string): Promise<Tombstone | undefined> {
    // Get a random unlooted tombstone that is NOT owned by this player and not expired
    const [tombstone] = await db
      .select()
      .from(tombstones)
      .where(
        and(
          drizzleSql`${tombstones.ownerId} != ${playerId}`,
          eq(tombstones.looted, false),
          drizzleSql`${tombstones.expiresAt} > NOW()`
        )
      )
      .orderBy(drizzleSql`RANDOM()`)
      .limit(1);
    return tombstone;
  }

  async getTombstoneById(tombstoneId: string): Promise<Tombstone | undefined> {
    const [tombstone] = await db
      .select()
      .from(tombstones)
      .where(eq(tombstones.id, tombstoneId));
    return tombstone;
  }

  async markTombstoneLooted(tombstoneId: string, lootedBy: string): Promise<void> {
    await db
      .update(tombstones)
      .set({
        looted: true,
        lootedBy,
        lootedAt: new Date(),
      })
      .where(eq(tombstones.id, tombstoneId));
  }

  async deleteTombstone(tombstoneId: string): Promise<void> {
    await db.delete(tombstones).where(eq(tombstones.id, tombstoneId));
  }

  async cleanupExpiredTombstones(): Promise<number> {
    const result = await db
      .delete(tombstones)
      .where(lt(tombstones.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  async getLootedTombstones(playerId: string): Promise<Tombstone[]> {
    // Get tombstones looted by this player
    return await db
      .select()
      .from(tombstones)
      .where(
        and(
          eq(tombstones.lootedBy, playerId),
          eq(tombstones.looted, true)
        )
      );
  }

  // Karma/Return operations
  async createReturnedLoot(lootData: InsertReturnedLoot): Promise<ReturnedLoot> {
    const [loot] = await db
      .insert(returnedLoot)
      .values(lootData)
      .returning();
    return loot;
  }

  async getPendingReturns(playerId: string): Promise<ReturnedLoot[]> {
    return await db
      .select()
      .from(returnedLoot)
      .where(
        and(
          eq(returnedLoot.originalOwnerId, playerId),
          eq(returnedLoot.claimed, false)
        )
      );
  }

  async claimReturnedLoot(lootId: string): Promise<ReturnedLoot> {
    const [claimed] = await db
      .update(returnedLoot)
      .set({
        claimed: true,
        claimedAt: new Date(),
      })
      .where(eq(returnedLoot.id, lootId))
      .returning();
    return claimed;
  }

  async addKarmaEvent(eventData: InsertKarmaEvent): Promise<KarmaEvent> {
    const [event] = await db
      .insert(karmaEvents)
      .values(eventData)
      .returning();
    return event;
  }

  async getKarmaLeaderboard(limit: number = 10): Promise<{ playerName: string; totalItems: number }[]> {
    const result = await db
      .select({
        playerName: karmaEvents.playerName,
        totalItems: drizzleSql<number>`SUM(${karmaEvents.itemCount})::int`,
      })
      .from(karmaEvents)
      .groupBy(karmaEvents.playerName)
      .orderBy(desc(drizzleSql`SUM(${karmaEvents.itemCount})`))
      .limit(limit);
    
    return result;
  }
}

export const storage = new DatabaseStorage();
