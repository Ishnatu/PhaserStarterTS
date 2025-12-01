import { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { recalculatePlayerStats } from "../security";
import { validateBody } from "../validation/middleware";
import { RepairAttemptSchema } from "../validation/schemas";

interface RepairCost {
  aa: number;
  ca: number;
}

function calculateRepairCost(item: any): RepairCost {
  const enhancementLevel = item.enhancementLevel || 0;
  const currentDurability = item.durability || 100;
  const maxDurability = item.maxDurability || 100;
  const missingDurability = maxDurability - currentDurability;

  if (missingDurability <= 0) {
    return { aa: 0, ca: 0 };
  }

  // Repair costs (whole numbers only):
  // AA: 1 + (enhancement × 2) per durability point
  // CA: Base 1 + scaled by durability and enhancement
  const aaCostPerPoint = 1 + (enhancementLevel * 2);
  const totalAA = Math.ceil(missingDurability * aaCostPerPoint);
  
  // CA formula: 1 base + (durability × enhancement multiplier) / 50
  // +0 item, 50 missing = 2 CA | +9 item, 50 missing = 11 CA
  const totalCA = 1 + Math.floor((missingDurability * (1 + enhancementLevel)) / 50);

  return { aa: totalAA, ca: totalCA };
}

export function registerRepairRoutes(app: Express) {
  app.post("/api/repair/attempt", isAuthenticated, validateBody(RepairAttemptSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { itemLocation, itemIndex, slotName, currency } = req.body;

      const gameSave = await storage.getGameSaveByUserId(userId);
      if (!gameSave) {
        return res.status(404).json({ message: "No save found" });
      }

      const saveData = gameSave.saveData as any;
      const player = saveData.player;

      let item: any = null;

      if (itemLocation === 'equipment') {
        if (!slotName || !player.equipment || !player.equipment[slotName]) {
          return res.status(400).json({ message: "Invalid equipment slot" });
        }
        item = player.equipment[slotName];
      } else if (itemLocation === 'inventory') {
        if (!Array.isArray(player.inventory) || itemIndex < 0 || itemIndex >= player.inventory.length) {
          return res.status(400).json({ message: "Invalid inventory index" });
        }
        item = player.inventory[itemIndex];
      } else {
        return res.status(400).json({ message: "Invalid item location" });
      }

      if (!item || !item.itemId) {
        return res.status(400).json({ message: "No item found at specified location" });
      }

      const cost = calculateRepairCost(item);

      if (cost.aa === 0 && cost.ca === 0) {
        return res.json({
          success: false,
          message: "Item is already at full durability!",
          newDurability: item.durability,
          maxDurability: item.maxDurability
        });
      }

      const playerCurrency = await storage.getPlayerCurrency(userId);
      if (!playerCurrency) {
        return res.status(400).json({ message: "Player currency not found" });
      }

      const requiredAmount = currency === 'AA' ? cost.aa : cost.ca;
      const hasEnough = currency === 'AA' 
        ? playerCurrency.arcaneAsh >= requiredAmount 
        : playerCurrency.crystallineAnimus >= requiredAmount;

      if (!hasEnough) {
        const currencyName = currency === 'AA' ? 'Arcane Ash' : 'Crystalline Animus';
        return res.status(400).json({ 
          message: `Insufficient funds! Need ${currency === 'AA' ? cost.aa : cost.ca} ${currencyName}` 
        });
      }

      const deductResult = currency === 'AA'
        ? await storage.deductCurrency(userId, cost.aa, 0)
        : await storage.deductCurrency(userId, 0, cost.ca);

      if (!deductResult) {
        return res.status(400).json({ message: "Failed to deduct currency" });
      }

      item.durability = item.maxDurability || 100;

      // Get player level for stats calculation
      const playerCurrencyState = await storage.getPlayerCurrency(userId);
      const playerLevel = playerCurrencyState?.level || 1;
      player.stats = recalculatePlayerStats(player.equipment || {}, playerLevel);

      await storage.saveGame({
        userId,
        saveData
      });

      const costText = currency === 'AA' ? `${cost.aa} AA` : `${cost.ca} CA`;
      res.json({
        success: true,
        message: `Item repaired for ${costText}!`,
        newDurability: item.durability,
        maxDurability: item.maxDurability,
        newArcaneAsh: deductResult.arcaneAsh,
        newCrystallineAnimus: deductResult.crystallineAnimus
      });
    } catch (error) {
      console.error("Error in repair attempt:", error);
      res.status(500).json({ message: "Failed to attempt repair" });
    }
  });

  app.post("/api/repair/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { items, currency } = req.body;

      if (!Array.isArray(items) || items.length === 0 || !['AA', 'CA'].includes(currency)) {
        return res.status(400).json({ message: "Invalid bulk repair request" });
      }

      const gameSave = await storage.getGameSaveByUserId(userId);
      if (!gameSave) {
        return res.status(404).json({ message: "No save found" });
      }

      const saveData = gameSave.saveData as any;
      const player = saveData.player;

      let totalAA = 0;
      let totalCA = 0;
      const itemsToRepair: Array<{ item: any; location: string }> = [];

      for (const itemRef of items) {
        let item: any = null;
        let location: string = '';

        if (itemRef.location === 'equipment' && itemRef.slotName) {
          if (player.equipment && player.equipment[itemRef.slotName]) {
            item = player.equipment[itemRef.slotName];
            location = `equipment.${itemRef.slotName}`;
          }
        } else if (itemRef.location === 'inventory' && typeof itemRef.index === 'number') {
          if (Array.isArray(player.inventory) && itemRef.index >= 0 && itemRef.index < player.inventory.length) {
            item = player.inventory[itemRef.index];
            location = `inventory[${itemRef.index}]`;
          }
        }

        if (item && item.itemId) {
          const cost = calculateRepairCost(item);
          if (cost.aa > 0 || cost.ca > 0) {
            totalAA += cost.aa;
            totalCA += cost.ca;
            itemsToRepair.push({ item, location });
          }
        }
      }

      if (itemsToRepair.length === 0) {
        return res.json({
          success: false,
          message: "No items need repair!",
          repairedCount: 0
        });
      }

      const playerCurrency = await storage.getPlayerCurrency(userId);
      if (!playerCurrency) {
        return res.status(400).json({ message: "Player currency not found" });
      }

      const requiredAmount = currency === 'AA' ? totalAA : totalCA;
      const hasEnough = currency === 'AA' 
        ? playerCurrency.arcaneAsh >= requiredAmount 
        : playerCurrency.crystallineAnimus >= requiredAmount;

      if (!hasEnough) {
        const currencyName = currency === 'AA' ? 'Arcane Ash' : 'Crystalline Animus';
        return res.status(400).json({ 
          message: `Insufficient funds! Need ${currency === 'AA' ? totalAA : totalCA} ${currencyName}` 
        });
      }

      const deductResult = currency === 'AA'
        ? await storage.deductCurrency(userId, totalAA, 0)
        : await storage.deductCurrency(userId, 0, totalCA);

      if (!deductResult) {
        return res.status(400).json({ message: "Failed to deduct currency" });
      }

      for (const { item } of itemsToRepair) {
        item.durability = item.maxDurability || 100;
      }

      // Get player level for stats calculation
      const playerCurrencyState = await storage.getPlayerCurrency(userId);
      const playerLevel = playerCurrencyState?.level || 1;
      player.stats = recalculatePlayerStats(player.equipment || {}, playerLevel);

      await storage.saveGame({
        userId,
        saveData
      });

      const costText = currency === 'AA' ? `${totalAA} AA` : `${totalCA} CA`;
      res.json({
        success: true,
        message: `Repaired ${itemsToRepair.length} items for ${costText}!`,
        repairedCount: itemsToRepair.length,
        newArcaneAsh: deductResult.arcaneAsh,
        newCrystallineAnimus: deductResult.crystallineAnimus
      });
    } catch (error) {
      console.error("Error in bulk repair:", error);
      res.status(500).json({ message: "Failed to complete bulk repair" });
    }
  });
}
