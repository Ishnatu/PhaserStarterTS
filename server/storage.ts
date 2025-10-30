// Storage layer for database operations
import {
  users,
  gameSaves,
  type User,
  type UpsertUser,
  type GameSave,
  type InsertGameSave,
} from "../shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Game save operations
  getGameSave(userId: string): Promise<GameSave | undefined>;
  saveGame(save: InsertGameSave): Promise<GameSave>;
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

  // Game save operations
  async getGameSave(userId: string): Promise<GameSave | undefined> {
    const [save] = await db
      .select()
      .from(gameSaves)
      .where(eq(gameSaves.userId, userId))
      .orderBy(desc(gameSaves.lastSaved))
      .limit(1);
    return save;
  }

  async saveGame(saveData: InsertGameSave): Promise<GameSave> {
    // Upsert logic: if a save exists for this user, update it; otherwise insert
    const existing = await this.getGameSave(saveData.userId);
    
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
}

export const storage = new DatabaseStorage();
