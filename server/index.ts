// Express server entry point
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";

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
// Conservative limits for 10-player game
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
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

// Apply rate limiters
app.use('/api/', generalLimiter);
app.use('/api/login', authLimiter);
app.use('/api/callback', authLimiter);

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5000",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
