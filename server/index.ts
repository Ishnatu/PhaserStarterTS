// Express server entry point
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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
