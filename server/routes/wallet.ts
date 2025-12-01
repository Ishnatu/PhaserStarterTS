import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { WalletBindingService } from "../web3/WalletBindingService";
import { WalletBindSchema, WalletUnbindSchema } from "../validation/schemas";
import { validateBody } from "../validation/middleware";
import rateLimit from "express-rate-limit";

const walletRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many wallet operations. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export function registerWalletRoutes(app: Express): void {
  app.get(
    "/api/wallet/binding",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        const result = await WalletBindingService.getBinding(userId);

        if (!result.success) {
          return res.status(500).json({ message: result.error });
        }

        res.json({
          hasBinding: !!result.binding,
          binding: result.binding || null,
        });
      } catch (error: any) {
        console.error("Get wallet binding error:", error);
        res.status(500).json({ message: "Failed to retrieve wallet binding" });
      }
    }
  );

  app.post(
    "/api/wallet/bind",
    isAuthenticated,
    walletRateLimiter,
    validateBody(WalletBindSchema),
    async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        const { walletAddress, attestationConfirmed } = req.body;
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
        const userAgent = req.headers["user-agent"] || "unknown";
        const sessionId = req.sessionID;

        const result = await WalletBindingService.bindWallet(
          {
            playerId: userId,
            walletAddress,
            attestationConfirmed,
          },
          sessionId,
          ip,
          userAgent
        );

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        res.json({
          success: true,
          binding: result.binding,
        });
      } catch (error: any) {
        console.error("Bind wallet error:", error);
        res.status(500).json({ message: "Failed to bind wallet" });
      }
    }
  );

  app.post(
    "/api/wallet/unbind",
    isAuthenticated,
    walletRateLimiter,
    validateBody(WalletUnbindSchema),
    async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        const { confirmUnbind } = req.body;
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
        const userAgent = req.headers["user-agent"] || "unknown";
        const sessionId = req.sessionID;

        const result = await WalletBindingService.requestUnbind(
          {
            playerId: userId,
            confirmUnbind,
          },
          sessionId,
          ip,
          userAgent
        );

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        res.json({
          success: true,
          message: "Unbinding requested. After the 7-day cooldown, you can bind a new wallet.",
          binding: result.binding,
        });
      } catch (error: any) {
        console.error("Unbind wallet error:", error);
        res.status(500).json({ message: "Failed to request wallet unbinding" });
      }
    }
  );

  app.post(
    "/api/wallet/cancel-unbind",
    isAuthenticated,
    walletRateLimiter,
    async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
        const userAgent = req.headers["user-agent"] || "unknown";
        const sessionId = req.sessionID;

        const result = await WalletBindingService.cancelUnbind(
          userId,
          sessionId,
          ip,
          userAgent
        );

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        res.json({
          success: true,
          message: "Unbinding cancelled. Your wallet binding is active again.",
          binding: result.binding,
        });
      } catch (error: any) {
        console.error("Cancel unbind error:", error);
        res.status(500).json({ message: "Failed to cancel unbind request" });
      }
    }
  );
}
