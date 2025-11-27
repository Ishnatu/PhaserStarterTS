import { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { FORGING_TIERS, MAX_ENHANCEMENT_LEVEL, BASE_ITEM_DURABILITY, getShinyChance } from "../../shared/forgingConfig";
import { recalculatePlayerStats } from "../security";

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

export function registerForgeRoutes(app: Express) {
  app.post("/api/forge/attempt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { itemLocation, itemIndex, slotName } = req.body;

      if (!itemLocation || (itemLocation !== 'equipment' && typeof itemIndex !== 'number')) {
        return res.status(400).json({ message: "Invalid forge request: need itemLocation and itemIndex (or slotName for equipment)" });
      }

      const gameSave = await storage.getGameSaveByUserId(userId);
      if (!gameSave) {
        return res.status(404).json({ message: "No save found" });
      }

      const saveData = gameSave.saveData as any;
      const player = saveData.player;

      let item: any = null;
      let itemContext: string = '';

      if (itemLocation === 'equipment') {
        if (!slotName || !player.equipment || !player.equipment[slotName]) {
          return res.status(400).json({ message: "Invalid equipment slot" });
        }
        item = player.equipment[slotName];
        itemContext = `equipment.${slotName}`;
      } else if (itemLocation === 'inventory') {
        if (!Array.isArray(player.inventory) || itemIndex < 0 || itemIndex >= player.inventory.length) {
          return res.status(400).json({ message: "Invalid inventory index" });
        }
        item = player.inventory[itemIndex];
        itemContext = `inventory[${itemIndex}]`;
      } else if (itemLocation === 'footlocker') {
        if (!Array.isArray(player.footlocker) || itemIndex < 0 || itemIndex >= player.footlocker.length) {
          return res.status(400).json({ message: "Invalid footlocker index" });
        }
        item = player.footlocker[itemIndex];
        itemContext = `footlocker[${itemIndex}]`;
      } else {
        return res.status(400).json({ message: "Invalid item location" });
      }

      if (!item || !item.itemId) {
        return res.status(400).json({ message: "No item found at specified location" });
      }

      const currentLevel = item.enhancementLevel || 0;
      const targetLevel = currentLevel + 1;

      if (targetLevel > MAX_ENHANCEMENT_LEVEL) {
        return res.json({
          success: false,
          destroyed: false,
          downgraded: false,
          newLevel: currentLevel,
          message: 'Item is already at maximum enhancement (+9)!'
        } as ForgingResult);
      }

      const tier = FORGING_TIERS.get(targetLevel);
      if (!tier) {
        return res.status(400).json({ message: "Invalid forging tier" });
      }

      const playerCurrency = await storage.getPlayerCurrency(userId);
      if (!playerCurrency) {
        return res.status(400).json({ message: "Player currency not found" });
      }

      const costAA = tier.costAA;
      const costCA = tier.costCA;

      if (playerCurrency.arcaneAsh < costAA || playerCurrency.crystallineAnimus < costCA) {
        return res.json({
          success: false,
          destroyed: false,
          downgraded: false,
          newLevel: currentLevel,
          message: `Insufficient funds! Need ${costAA} AA and ${costCA} CA`,
          newArcaneAsh: playerCurrency.arcaneAsh,
          newCrystallineAnimus: playerCurrency.crystallineAnimus
        } as ForgingResult);
      }

      const deductResult = await storage.deductCurrency(userId, costAA, costCA);
      if (!deductResult) {
        return res.status(400).json({ message: "Failed to deduct currency" });
      }

      const successRoll = Math.random();
      let result: ForgingResult;

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

        result = {
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
          newArcaneAsh: deductResult.arcaneAsh,
          newCrystallineAnimus: deductResult.crystallineAnimus
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

          result = {
            success: false,
            destroyed: true,
            downgraded: false,
            newLevel: 0,
            message: `DESTROYED! The item shattered during forging!`,
            newArcaneAsh: deductResult.arcaneAsh,
            newCrystallineAnimus: deductResult.crystallineAnimus
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

          result = {
            success: false,
            destroyed: false,
            downgraded: true,
            newLevel: newLevel,
            newDurability: item.durability,
            newMaxDurability: item.maxDurability,
            message,
            newArcaneAsh: deductResult.arcaneAsh,
            newCrystallineAnimus: deductResult.crystallineAnimus
          };
        } else {
          result = {
            success: false,
            destroyed: false,
            downgraded: false,
            newLevel: currentLevel,
            message: `FAILED! No change to item.`,
            newArcaneAsh: deductResult.arcaneAsh,
            newCrystallineAnimus: deductResult.crystallineAnimus
          };
        }
      }

      // Get player level for stats calculation
      const playerCurrencyState = await storage.getPlayerCurrency(userId);
      const playerLevel = playerCurrencyState?.level || 1;
      
      // Recalculate player stats from equipment before saving
      player.stats = recalculatePlayerStats(player.equipment || {}, playerLevel);

      await storage.saveGame({
        userId,
        saveData
      });

      res.json(result);
    } catch (error) {
      console.error("Error in forge attempt:", error);
      res.status(500).json({ message: "Failed to attempt forge" });
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
