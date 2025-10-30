// API routes for game save/load and authentication
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // Get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Load game save for authenticated user
  app.get("/api/game/load", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const gameSave = await storage.getGameSave(userId);
      
      if (!gameSave) {
        return res.status(404).json({ message: "No save found" });
      }
      
      res.json({
        saveData: gameSave.saveData,
        lastSaved: gameSave.lastSaved
      });
    } catch (error) {
      console.error("Error loading game:", error);
      res.status(500).json({ message: "Failed to load game" });
    }
  });

  // Save game state for authenticated user
  app.post("/api/game/save", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { saveData } = req.body;
      
      if (!saveData) {
        return res.status(400).json({ message: "Save data required" });
      }
      
      const result = await storage.saveGame({
        userId,
        saveData,
      });
      
      res.json({
        success: true,
        lastSaved: result.lastSaved
      });
    } catch (error) {
      console.error("Error saving game:", error);
      res.status(500).json({ message: "Failed to save game" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
