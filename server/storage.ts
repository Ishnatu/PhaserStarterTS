// Storage layer for database operations
import {
  users,
  gameSaves,
  tombstones,
  soulboundItems,
  returnedLoot,
  karmaEvents,
  playerCurrencies,
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
  type PlayerCurrency,
  type InsertPlayerCurrency,
} from "../shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, sql as drizzleSql } from "drizzle-orm";

export interface IStorage {
  // User operations (Replit Auth only)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Game save operations - authenticated users only
  getGameSaveByUserId(userId: string): Promise<GameSave | undefined>;
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
  
  // Currency operations (server-authoritative)
  getPlayerCurrency(playerId: string): Promise<PlayerCurrency | undefined>;
  ensurePlayerCurrency(playerId: string, arcaneAsh: number, crystallineAnimus: number): Promise<PlayerCurrency>;
  deductCrystallineAnimus(playerId: string, amount: number): Promise<PlayerCurrency | null>;
  deductCurrency(playerId: string, arcaneAsh: number, crystallineAnimus: number): Promise<PlayerCurrency | null>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
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

  // Game save operations - authenticated users only
  async getGameSaveByUserId(userId: string): Promise<GameSave | undefined> {
    const [save] = await db
      .select()
      .from(gameSaves)
      .where(eq(gameSaves.userId, userId))
      .orderBy(desc(gameSaves.lastSaved))
      .limit(1);
    return save;
  }

  async saveGame(saveData: InsertGameSave): Promise<GameSave> {
    // Upsert logic: find existing save by userId, then update or insert
    let existing: GameSave | undefined;
    
    if (saveData.userId) {
      existing = await this.getGameSaveByUserId(saveData.userId);
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

  // Currency operations - server-authoritative
  async getPlayerCurrency(playerId: string): Promise<PlayerCurrency | undefined> {
    const [currency] = await db
      .select()
      .from(playerCurrencies)
      .where(eq(playerCurrencies.playerId, playerId));
    return currency;
  }

  async ensurePlayerCurrency(playerId: string, arcaneAsh: number, crystallineAnimus: number): Promise<PlayerCurrency> {
    // INSERT-ONLY: create currency record if it doesn't exist, NEVER overwrite existing
    // This prevents client tampering from overwriting server-authoritative balances
    try {
      const [currency] = await db
        .insert(playerCurrencies)
        .values({
          playerId,
          arcaneAsh,
          crystallineAnimus,
          level: 1,
          experience: 0,
        })
        .onConflictDoNothing() // Critical: do NOT update on conflict
        .returning();
      
      // If conflict (record exists), return existing record
      if (!currency) {
        const existing = await this.getPlayerCurrency(playerId);
        if (!existing) {
          throw new Error(`Failed to ensure currency for player ${playerId}`);
        }
        return existing;
      }
      
      return currency;
    } catch (error) {
      console.error(`Error ensuring currency for player ${playerId}:`, error);
      throw error;
    }
  }

  async grantExperience(playerId: string, xpAmount: number): Promise<{ newLevel: number; newExperience: number; leveledUp: boolean }> {
    const current = await this.getPlayerCurrency(playerId);
    if (!current) {
      throw new Error(`Player ${playerId} not found`);
    }

    let newExperience = current.experience + xpAmount;
    let newLevel = current.level;
    let leveledUp = false;

    // Level up logic: 100 XP per level
    const xpForNextLevel = (level: number) => level * 100;
    
    while (newExperience >= xpForNextLevel(newLevel) && newLevel < 50) {
      newExperience -= xpForNextLevel(newLevel);
      newLevel++;
      leveledUp = true;
    }

    const [updated] = await db
      .update(playerCurrencies)
      .set({
        level: newLevel,
        experience: newExperience,
        updatedAt: new Date(),
      })
      .where(eq(playerCurrencies.playerId, playerId))
      .returning();

    return { newLevel: updated.level, newExperience: updated.experience, leveledUp };
  }

  async addCurrency(playerId: string, arcaneAsh: number, crystallineAnimus: number): Promise<PlayerCurrency> {
    const [updated] = await db
      .update(playerCurrencies)
      .set({
        arcaneAsh: drizzleSql`${playerCurrencies.arcaneAsh} + ${arcaneAsh}`,
        crystallineAnimus: drizzleSql`${playerCurrencies.crystallineAnimus} + ${crystallineAnimus}`,
        updatedAt: new Date(),
      })
      .where(eq(playerCurrencies.playerId, playerId))
      .returning();

    return updated;
  }

  async deductCrystallineAnimus(playerId: string, amount: number): Promise<PlayerCurrency | null> {
    // Atomic update - deduct only if sufficient balance
    const [updated] = await db
      .update(playerCurrencies)
      .set({
        crystallineAnimus: drizzleSql`${playerCurrencies.crystallineAnimus} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(playerCurrencies.playerId, playerId),
          drizzleSql`${playerCurrencies.crystallineAnimus} >= ${amount}`
        )
      )
      .returning();
    
    return updated || null;
  }

  async deductCurrency(playerId: string, arcaneAsh: number, crystallineAnimus: number): Promise<PlayerCurrency | null> {
    // Atomic update - deduct only if sufficient balance for BOTH currencies
    const [updated] = await db
      .update(playerCurrencies)
      .set({
        arcaneAsh: drizzleSql`${playerCurrencies.arcaneAsh} - ${arcaneAsh}`,
        crystallineAnimus: drizzleSql`${playerCurrencies.crystallineAnimus} - ${crystallineAnimus}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(playerCurrencies.playerId, playerId),
          drizzleSql`${playerCurrencies.arcaneAsh} >= ${arcaneAsh}`,
          drizzleSql`${playerCurrencies.crystallineAnimus} >= ${crystallineAnimus}`
        )
      )
      .returning();
    
    return updated || null;
  }
}

export const storage = new DatabaseStorage();
