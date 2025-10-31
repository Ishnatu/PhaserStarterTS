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

  // Load game save - supports both authenticated users and anonymous sessions
  app.get("/api/game/load", async (req: any, res) => {
    try {
      let gameSave;
      
      // Try authenticated user first
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
        const userId = req.user.claims.sub;
        gameSave = await storage.getGameSaveByUserId(userId);
      }
      
      // Fall back to session ID from header
      if (!gameSave) {
        const sessionId = req.headers['x-session-id'];
        if (sessionId) {
          gameSave = await storage.getGameSaveBySessionId(sessionId as string);
        }
      }
      
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

  // Save game state - supports both authenticated users and anonymous sessions
  app.post("/api/game/save", async (req: any, res) => {
    try {
      const { saveData } = req.body;
      
      if (!saveData) {
        return res.status(400).json({ message: "Save data required" });
      }
      
      let userId: string | undefined;
      let sessionId: string | undefined;
      
      // Use authenticated userId if available
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
        userId = req.user.claims.sub;
      } else {
        // Otherwise use session ID from header
        sessionId = req.headers['x-session-id'] as string;
        if (!sessionId) {
          return res.status(400).json({ message: "Session ID required" });
        }
      }
      
      const result = await storage.saveGame({
        userId,
        sessionId,
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
