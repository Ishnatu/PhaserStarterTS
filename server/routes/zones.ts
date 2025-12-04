import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { ZONES, getZoneById, isZoneUnlockable } from "../../shared/zoneConfig";

export function registerZoneRoutes(app: Express) {
  /**
   * GET /api/zones/progress
   * Returns the player's delve progress and discovered zones
   * SERVER-AUTHORITATIVE: Progress is read from database
   */
  app.get("/api/zones/progress", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Ensure player currency record exists
      await storage.ensurePlayerCurrency(userId, 0, 0);
      
      const progress = await storage.getDelveProgress(userId);
      
      if (!progress) {
        return res.status(404).json({ message: "Player not found" });
      }

      console.log(`[ZONES] Progress for ${userId}:`, JSON.stringify(progress));

      res.json({
        success: true,
        delvesCompletedByTier: {
          tier1: progress.tier1,
          tier2: progress.tier2,
          tier3: progress.tier3,
          tier4: progress.tier4,
          tier5: progress.tier5,
        },
        discoveredZones: progress.discoveredZones,
      });
    } catch (error) {
      console.error("Error fetching zone progress:", error);
      res.status(500).json({ message: "Failed to fetch zone progress" });
    }
  });

  /**
   * POST /api/zones/discover
   * Marks a zone as discovered after player uses the rift
   * SERVER-AUTHORITATIVE: Zone discovery is validated and persisted
   */
  app.post("/api/zones/discover", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { zoneId } = req.body;

      // Validate zone exists
      const zone = getZoneById(zoneId);
      if (!zone) {
        return res.status(400).json({ message: "Invalid zone ID" });
      }

      // Get player's current progress
      const progress = await storage.getDelveProgress(userId);
      if (!progress) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Check if player has met the unlock requirements
      const delvesCompletedByTier = {
        tier1: progress.tier1,
        tier2: progress.tier2,
        tier3: progress.tier3,
        tier4: progress.tier4,
        tier5: progress.tier5,
      };

      if (!isZoneUnlockable(zone, delvesCompletedByTier)) {
        return res.status(403).json({ 
          message: "Zone not unlockable - insufficient delves completed",
          required: zone.unlockRequirement.delvesRequired,
          completed: delvesCompletedByTier[`tier${zone.unlockRequirement.previousTier}` as keyof typeof delvesCompletedByTier] || 0,
        });
      }

      // Mark zone as discovered
      const discoveredZones = await storage.discoverZone(userId, zoneId);

      res.json({
        success: true,
        message: `Discovered ${zone.name}!`,
        discoveredZones,
      });
    } catch (error) {
      console.error("Error discovering zone:", error);
      res.status(500).json({ message: "Failed to discover zone" });
    }
  });

  /**
   * POST /api/zones/warp
   * Warps player to a discovered zone (deducts currency)
   * SERVER-AUTHORITATIVE: Currency is validated and deducted atomically
   */
  app.post("/api/zones/warp", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { zoneId } = req.body;

      // Validate zone exists
      const zone = getZoneById(zoneId);
      if (!zone) {
        return res.status(400).json({ message: "Invalid zone ID" });
      }

      // Get player's current progress
      const progress = await storage.getDelveProgress(userId);
      if (!progress) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Check if zone has been discovered
      if (!progress.discoveredZones.includes(zoneId)) {
        return res.status(403).json({ 
          message: "Zone not discovered - find the rift first!",
        });
      }

      // Deduct warp fee
      const result = await storage.deductCurrency(
        userId,
        zone.portalFee.arcaneAsh,
        zone.portalFee.crystallineAnimus
      );

      if (!result) {
        return res.status(400).json({ 
          message: "Insufficient currency for warp",
          required: zone.portalFee,
        });
      }

      res.json({
        success: true,
        message: `Warped to ${zone.name}!`,
        zoneId,
        newCurrency: {
          arcaneAsh: result.arcaneAsh,
          crystallineAnimus: result.crystallineAnimus,
        },
      });
    } catch (error) {
      console.error("Error warping to zone:", error);
      res.status(500).json({ message: "Failed to warp to zone" });
    }
  });
}
