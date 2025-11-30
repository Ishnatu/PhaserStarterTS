// Express server entry point
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { logSecurityEvent, getSecurityStats } from "./securityMonitor";

dotenv.config();

// Security: Validate critical environment variables at startup
function validateEnvironment(): void {
  const sessionSecret = process.env.SESSION_SECRET;
  
  if (!sessionSecret) {
    console.error('[SECURITY] FATAL: SESSION_SECRET is not set');
    console.error('Please set SESSION_SECRET in your environment with a secure random string (minimum 32 characters)');
    process.exit(1);
  }
  
  if (sessionSecret.length < 32) {
    console.error('[SECURITY] FATAL: SESSION_SECRET is too short');
    console.error(`Current length: ${sessionSecret.length}, required: 32+ characters`);
    console.error('Please use a cryptographically secure random string');
    process.exit(1);
  }
  
  // In production, require explicit CLIENT_URL
  if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
    console.warn('[SECURITY] WARNING: CLIENT_URL not set in production, CORS will use fallback origin');
  }
  
  console.log('[SECURITY] Environment validation passed');
}

validateEnvironment();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers with Helmet.js
// Configured for Phaser game served within Replit iframe
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for Phaser
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:"], // WebSocket for Vite HMR
      mediaSrc: ["'self'", "data:", "blob:"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding in Replit iframe
  crossOriginOpenerPolicy: false, // Required for cross-origin communication
}));

// Rate limiting - protect against abuse
// [SECURITY FIX] Tightened limits based on normal user behavior analysis
// Normal gameplay: ~20-25 requests/minute during active play
// Limits set to ~15% above baseline to accommodate legitimate bursts
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute (was 100 - too permissive)
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for admin endpoints (very restrictive)
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many admin requests',
});

// [SECURITY] Specific rate limiters for high-value endpoints
// These are targets for exploitation and need stricter limits
const combatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 combat actions per minute (covers fast but legitimate play)
  message: { message: 'Combat rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

const lootLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 loot claims per minute (kills don't happen that fast)
  message: { message: 'Loot claim rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

const delveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 delve operations per minute (delves take time)
  message: { message: 'Delve rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

const saveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 saves per minute (throttled saves + transitions)
  message: { message: 'Save rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters (order matters - specific before general)
app.use('/api/combat/', combatLimiter);
app.use('/api/loot/', lootLimiter);
app.use('/api/delve/', delveLimiter);
app.use('/api/save', saveLimiter);
app.use('/api/login', authLimiter);
app.use('/api/callback', authLimiter);
app.use('/api/admin/', adminLimiter);
app.use('/api/', generalLimiter);

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5000",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Note: securityMiddleware is applied in registerRoutes AFTER auth setup

// Log server startup
logSecurityEvent('SERVER_START', 'LOW', { port: PORT }, null, 'server', 'system');

// Register routes (API routes)
async function startServer() {
  const server = await registerRoutes(app);
  
  // Serve static files from Vite build (in production)
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));
  
  // SPA fallback: serve index.html for all unmatched routes (client-side routing)
  app.use((req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
