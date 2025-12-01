import { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { recalculatePlayerStats } from "../security";
import { validateBody } from "../validation/middleware";
import { ShopPurchaseSchema } from "../validation/schemas";

interface ShopItem {
  itemId: string;
  price: number;
  currency: 'AA' | 'CA';
}

const SHOP_INVENTORY: ShopItem[] = [
  { itemId: 'dagger_basic', price: 50, currency: 'AA' },
  { itemId: 'shortsword_basic', price: 75, currency: 'AA' },
  { itemId: 'rapier_basic', price: 150, currency: 'AA' },
  { itemId: 'longsword_basic', price: 100, currency: 'AA' },
  { itemId: 'battleaxe_basic', price: 100, currency: 'AA' },
  { itemId: 'mace_basic', price: 75, currency: 'AA' },
  { itemId: 'warhammer_basic', price: 175, currency: 'AA' },
  { itemId: 'spear_basic', price: 60, currency: 'AA' },
  { itemId: 'greatsword_basic', price: 250, currency: 'AA' },
  { itemId: 'greataxe_basic', price: 275, currency: 'AA' },
  { itemId: 'staff_basic', price: 150, currency: 'AA' },
  { itemId: 'shield_wooden', price: 75, currency: 'AA' },
  { itemId: 'shield_steel', price: 125, currency: 'AA' },
  { itemId: 'helmet_leather', price: 40, currency: 'AA' },
  { itemId: 'helmet_heavy', price: 80, currency: 'AA' },
  { itemId: 'chest_leather', price: 60, currency: 'AA' },
  { itemId: 'chest_heavy', price: 120, currency: 'AA' },
  { itemId: 'legs_leather', price: 50, currency: 'AA' },
  { itemId: 'legs_heavy', price: 90, currency: 'AA' },
  { itemId: 'boots_leather', price: 35, currency: 'AA' },
  { itemId: 'boots_heavy', price: 70, currency: 'AA' },
  { itemId: 'shoulders_leather', price: 40, currency: 'AA' },
  { itemId: 'shoulders_heavy', price: 85, currency: 'AA' },
  { itemId: 'cape_basic', price: 30, currency: 'AA' },
  { itemId: 'potion_health', price: 25, currency: 'AA' },
  { itemId: 'potion_stamina', price: 25, currency: 'AA' },
];

export function registerShopRoutes(app: Express) {
  app.post("/api/shop/purchase", isAuthenticated, validateBody(ShopPurchaseSchema), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { itemId, price, currency } = req.body;

      const shopItem = SHOP_INVENTORY.find(item => item.itemId === itemId);
      if (!shopItem) {
        return res.status(400).json({ message: "Item not available in shop" });
      }

      if (shopItem.price !== price || shopItem.currency !== currency) {
        return res.status(400).json({ message: "Price mismatch - please refresh shop" });
      }

      const gameSave = await storage.getGameSaveByUserId(userId);
      if (!gameSave) {
        return res.status(404).json({ message: "No save found" });
      }

      const saveData = gameSave.saveData as any;
      const player = saveData.player;

      const totalInventory = player.inventory.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
      if (totalInventory >= (player.inventorySlots || 15)) {
        return res.status(400).json({ message: "Inventory is full!" });
      }

      const playerCurrency = await storage.getPlayerCurrency(userId);
      if (!playerCurrency) {
        return res.status(400).json({ message: "Player currency not found" });
      }

      const hasEnough = currency === 'AA' 
        ? playerCurrency.arcaneAsh >= price 
        : playerCurrency.crystallineAnimus >= price;

      if (!hasEnough) {
        const currencyName = currency === 'AA' ? 'Arcane Ash' : 'Crystalline Animus';
        return res.status(400).json({ message: `Not enough ${currencyName}!` });
      }

      const deductResult = currency === 'AA'
        ? await storage.deductCurrency(userId, price, 0)
        : await storage.deductCurrency(userId, 0, price);

      if (!deductResult) {
        return res.status(400).json({ message: "Failed to deduct currency" });
      }

      const existing = player.inventory.find((item: any) => item.itemId === itemId);
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
      } else {
        player.inventory.push({ itemId, quantity: 1 });
      }

      // Get player level for stats calculation
      const playerCurrencyState = await storage.getPlayerCurrency(userId);
      const playerLevel = playerCurrencyState?.level || 1;
      player.stats = recalculatePlayerStats(player.equipment || {}, playerLevel);

      await storage.saveGame({
        userId,
        saveData
      });

      res.json({
        success: true,
        message: `Purchased item for ${price} ${currency}!`,
        newArcaneAsh: deductResult.arcaneAsh,
        newCrystallineAnimus: deductResult.crystallineAnimus,
        inventory: player.inventory
      });
    } catch (error) {
      console.error("Error in shop purchase:", error);
      res.status(500).json({ message: "Failed to complete purchase" });
    }
  });

  app.get("/api/shop/inventory", isAuthenticated, async (req: any, res) => {
    try {
      res.json({ items: SHOP_INVENTORY });
    } catch (error) {
      console.error("Error getting shop inventory:", error);
      res.status(500).json({ message: "Failed to get shop inventory" });
    }
  });
}
