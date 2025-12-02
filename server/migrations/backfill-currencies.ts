// One-time migration script to backfill playerCurrencies from game saves
// Run with: tsx server/migrations/backfill-currencies.ts

import { db } from "../db";
import { gameSaves, playerCurrencies } from "../../shared/schema";
import { eq } from "drizzle-orm";

async function backfillCurrencies() {
  console.log("Starting currency backfill migration...");
  
  try {
    // Fetch all game saves
    const saves = await db.select().from(gameSaves);
    console.log(`Found ${saves.length} game saves to process`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const save of saves) {
      try {
        // Handle case where saveData might be a JSON string or object
        const saveData = typeof save.saveData === 'string' 
          ? JSON.parse(save.saveData as string) 
          : save.saveData as any;
        
        // Check if currency record already exists
        const [existing] = await db
          .select()
          .from(playerCurrencies)
          .where(eq(playerCurrencies.playerId, save.userId));
        
        if (existing) {
          console.log(`Player ${save.userId}: currency record already exists, skipping`);
          skipped++;
          continue;
        }
        
        // Extract and clamp currency from save data
        const arcaneAsh = Math.max(0, Math.min(1000000, parseInt(saveData.arcaneAsh) || 0));
        const crystallineAnimus = Math.max(0, Math.min(100000, parseInt(saveData.crystallineAnimus) || 0));
        
        // Insert currency record
        await db.insert(playerCurrencies).values({
          playerId: save.userId,
          arcaneAsh,
          crystallineAnimus,
        });
        
        // Remove currency fields from save data
        delete saveData.arcaneAsh;
        delete saveData.crystallineAnimus;
        
        // Update save without currency fields
        await db
          .update(gameSaves)
          .set({ saveData })
          .where(eq(gameSaves.userId, save.userId));
        
        console.log(`Player ${save.userId}: migrated ${arcaneAsh} AA, ${crystallineAnimus} CA`);
        migrated++;
      } catch (error) {
        console.error(`Error migrating player ${save.userId}:`, error);
        errors++;
      }
    }
    
    console.log("\nMigration complete!");
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

backfillCurrencies()
  .then(() => {
    console.log("Migration script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
