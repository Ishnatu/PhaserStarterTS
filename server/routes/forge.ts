import { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { FORGING_TIERS, MAX_ENHANCEMENT_LEVEL, BASE_ITEM_DURABILITY, getShinyChance } from "../../shared/forgingConfig";
import { recalculatePlayerStats, logSecurityEvent } from "../security";
import { db } from "../db";
import { gameSaves, playerCurrencies } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { validateBody } from "../validation/middleware";
import { ForgeAttemptSchema } from "../validation/schemas";

export interface ForgingResult {
  success: boolean;
  destroyed: boolean;
  downgraded: boolean;
  newLevel: number;
  message: string;
  shinyCreated?: boolean;
  newDurability?: number;
  newMaxDurability?: number;
  newArcaneAsh?: number;
  newCrystallineAnimus?: number;
}

/**
 * [SECURITY] Per-player forge attempt tracking for race condition prevention
 * Tracks in-flight forge operations to prevent concurrent forge exploits
 */
const activeForgeOperations = new Set<string>();

export function registerForgeRoutes(app: Express) {
  app.post("/api/forge/attempt", isAuthenticated, validateBody(ForgeAttemptSchema), async (req: any, res) => {
    const userId = req.user.claims.sub;
    
    // [SECURITY] Prevent concurrent forge operations per user
    if (activeForgeOperations.has(userId)) {
      logSecurityEvent(userId, 'FORGE_CONCURRENT_ATTEMPT', 'HIGH', {
        message: 'Concurrent forge attempt blocked - possible race exploit',
        ip: req.ip,
      });
      return res.status(429).json({ message: "Forge already in progress. Please wait." });
    }
    
    activeForgeOperations.add(userId);
    
    try {
      const { itemLocation, itemIndex, slotName } = req.body;

      // [SECURITY] Use database transaction with row-level locking
      // This prevents TOCTOU race conditions on save and currency
      const result = await db.transaction(async (tx) => {
        // Lock the game save row for this user
        const [lockedSave] = await tx
          .select()
          .from(gameSaves)
          .where(eq(gameSaves.userId, userId))
          .for('update');
        
        if (!lockedSave) {
          throw new Error("NO_SAVE");
        }

        // Lock the currency row for this user
        const [lockedCurrency] = await tx
          .select()
          .from(playerCurrencies)
          .where(eq(playerCurrencies.playerId, userId))
          .for('update');

        if (!lockedCurrency) {
          throw new Error("NO_CURRENCY");
        }

        // Handle case where saveData might be a JSON string or object
        const saveData = typeof lockedSave.saveData === 'string' 
          ? JSON.parse(lockedSave.saveData as string) 
          : lockedSave.saveData as any;
        const player = saveData.player;

        let item: any = null;
        let itemContext: string = '';

        if (itemLocation === 'equipment') {
          console.log('[FORGE] Equipment forge request - slotName:', slotName);
          console.log('[FORGE] Player equipment keys:', player.equipment ? Object.keys(player.equipment) : 'no equipment');
          console.log('[FORGE] Equipment slot value:', player.equipment?.[slotName as keyof typeof player.equipment]);
          
          if (!slotName) {
            console.log('[FORGE] Error: slotName is missing');
            throw new Error("INVALID_SLOT");
          }
          if (!player.equipment) {
            console.log('[FORGE] Error: player.equipment is missing');
            throw new Error("INVALID_SLOT");
          }
          if (!player.equipment[slotName as keyof typeof player.equipment]) {
            console.log('[FORGE] Error: no item in slot', slotName);
            throw new Error("INVALID_SLOT");
          }
          item = player.equipment[slotName as keyof typeof player.equipment];
          itemContext = `equipment.${slotName}`;
        } else if (itemLocation === 'inventory') {
          if (!Array.isArray(player.inventory) || itemIndex < 0 || itemIndex >= player.inventory.length) {
            throw new Error("INVALID_INDEX");
          }
          item = player.inventory[itemIndex];
          itemContext = `inventory[${itemIndex}]`;
        } else if (itemLocation === 'footlocker') {
          if (!Array.isArray(player.footlocker) || itemIndex < 0 || itemIndex >= player.footlocker.length) {
            throw new Error("INVALID_INDEX");
          }
          item = player.footlocker[itemIndex];
          itemContext = `footlocker[${itemIndex}]`;
        } else {
          throw new Error("INVALID_LOCATION");
        }

        if (!item || !item.itemId) {
          throw new Error("NO_ITEM");
        }

        const currentLevel = item.enhancementLevel || 0;
        const targetLevel = currentLevel + 1;

        if (targetLevel > MAX_ENHANCEMENT_LEVEL) {
          return {
            success: false,
            destroyed: false,
            downgraded: false,
            newLevel: currentLevel,
            message: 'Item is already at maximum enhancement (+9)!',
            newArcaneAsh: lockedCurrency.arcaneAsh,
            newCrystallineAnimus: lockedCurrency.crystallineAnimus
          } as ForgingResult;
        }

        const tier = FORGING_TIERS.get(targetLevel);
        if (!tier) {
          throw new Error("INVALID_TIER");
        }

        const costAA = tier.costAA;
        const costCA = tier.costCA;

        if (lockedCurrency.arcaneAsh < costAA || lockedCurrency.crystallineAnimus < costCA) {
          return {
            success: false,
            destroyed: false,
            downgraded: false,
            newLevel: currentLevel,
            message: `Insufficient funds! Need ${costAA} AA and ${costCA} CA`,
            newArcaneAsh: lockedCurrency.arcaneAsh,
            newCrystallineAnimus: lockedCurrency.crystallineAnimus
          } as ForgingResult;
        }

        // Deduct currency atomically within transaction
        const [updatedCurrency] = await tx
          .update(playerCurrencies)
          .set({
            arcaneAsh: sql`${playerCurrencies.arcaneAsh} - ${costAA}`,
            crystallineAnimus: sql`${playerCurrencies.crystallineAnimus} - ${costCA}`,
            updatedAt: new Date(),
          })
          .where(eq(playerCurrencies.playerId, userId))
          .returning();

        const successRoll = Math.random();
        let forgeResult: ForgingResult;

        if (successRoll < tier.successChance) {
          const newEnhancementLevel = targetLevel;
          const newMaxDurability = (item.maxDurability || BASE_ITEM_DURABILITY) + 10;
          const newDurability = newMaxDurability;

          item.enhancementLevel = newEnhancementLevel;
          item.maxDurability = newMaxDurability;
          item.durability = newDurability;

          const shinyRoll = Math.random();
          const shinyChance = getShinyChance(targetLevel);
          const shinyCreated = shinyRoll < shinyChance;

          if (shinyCreated) {
            item.isShiny = true;
          }

          forgeResult = {
            success: true,
            destroyed: false,
            downgraded: false,
            newLevel: newEnhancementLevel,
            newDurability,
            newMaxDurability,
            message: shinyCreated 
              ? `★ SHINY! ★ Item enhanced to +${targetLevel} and glows with golden radiance!`
              : `SUCCESS! Item enhanced to +${targetLevel}!`,
            shinyCreated,
            newArcaneAsh: updatedCurrency.arcaneAsh,
            newCrystallineAnimus: updatedCurrency.crystallineAnimus
          };
        } else {
          const destructionRoll = Math.random();
          const isShiny = item.isShiny === true;

          if (destructionRoll < tier.destructionChance && !isShiny) {
            if (itemLocation === 'equipment') {
              player.equipment[slotName] = null;
            } else if (itemLocation === 'inventory') {
              player.inventory.splice(itemIndex, 1);
            } else if (itemLocation === 'footlocker') {
              player.footlocker.splice(itemIndex, 1);
            }

            forgeResult = {
              success: false,
              destroyed: true,
              downgraded: false,
              newLevel: 0,
              message: `DESTROYED! The item shattered during forging!`,
              newArcaneAsh: updatedCurrency.arcaneAsh,
              newCrystallineAnimus: updatedCurrency.crystallineAnimus
            };
          } else if (tier.failureResult === 'downgrade') {
            const newLevel = Math.max(0, currentLevel - 1);
            
            if (newLevel < currentLevel) {
              item.enhancementLevel = newLevel;
              item.maxDurability = Math.max(BASE_ITEM_DURABILITY, (item.maxDurability || BASE_ITEM_DURABILITY) - 10);
              item.durability = Math.min(item.durability || BASE_ITEM_DURABILITY, item.maxDurability);
            }

            const message = isShiny 
              ? `FAILED! Shiny item downgraded to +${newLevel} (protected from destruction)`
              : `FAILED! Item downgraded to +${newLevel}`;

            forgeResult = {
              success: false,
              destroyed: false,
              downgraded: true,
              newLevel: newLevel,
              newDurability: item.durability,
              newMaxDurability: item.maxDurability,
              message,
              newArcaneAsh: updatedCurrency.arcaneAsh,
              newCrystallineAnimus: updatedCurrency.crystallineAnimus
            };
          } else {
            forgeResult = {
              success: false,
              destroyed: false,
              downgraded: false,
              newLevel: currentLevel,
              message: `FAILED! No change to item.`,
              newArcaneAsh: updatedCurrency.arcaneAsh,
              newCrystallineAnimus: updatedCurrency.crystallineAnimus
            };
          }
        }

        // Recalculate player stats from equipment before saving
        const playerLevel = lockedCurrency.level || 1;
        player.stats = recalculatePlayerStats(player.equipment || {}, playerLevel);

        // Save game within transaction
        await tx
          .update(gameSaves)
          .set({
            saveData: saveData,
            lastSaved: new Date(),
          })
          .where(eq(gameSaves.userId, userId));

        return forgeResult;
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error in forge attempt:", error);
      
      if (error.message === "NO_SAVE") {
        return res.status(404).json({ message: "No save found" });
      } else if (error.message === "NO_CURRENCY") {
        return res.status(400).json({ message: "Player currency not found" });
      } else if (error.message === "INVALID_SLOT") {
        return res.status(400).json({ message: "Invalid equipment slot" });
      } else if (error.message === "INVALID_INDEX") {
        return res.status(400).json({ message: "Invalid inventory/footlocker index" });
      } else if (error.message === "INVALID_LOCATION") {
        return res.status(400).json({ message: "Invalid item location" });
      } else if (error.message === "NO_ITEM") {
        return res.status(400).json({ message: "No item found at specified location" });
      } else if (error.message === "INVALID_TIER") {
        return res.status(400).json({ message: "Invalid forging tier" });
      }
      
      res.status(500).json({ message: "Failed to attempt forge" });
    } finally {
      // [SECURITY] Always clean up the lock
      activeForgeOperations.delete(userId);
    }
  });

  app.get("/api/forge/cost/:targetLevel", isAuthenticated, async (req: any, res) => {
    try {
      const targetLevel = parseInt(req.params.targetLevel);
      
      if (isNaN(targetLevel) || targetLevel < 1 || targetLevel > MAX_ENHANCEMENT_LEVEL) {
        return res.status(400).json({ message: "Invalid target level" });
      }

      const tier = FORGING_TIERS.get(targetLevel);
      if (!tier) {
        return res.status(400).json({ message: "Invalid forging tier" });
      }

      res.json({
        targetLevel,
        costAA: tier.costAA,
        costCA: tier.costCA,
        successChance: tier.successChance,
        destructionChance: tier.destructionChance
      });
    } catch (error) {
      console.error("Error getting forge cost:", error);
      res.status(500).json({ message: "Failed to get forge cost" });
    }
  });
}
