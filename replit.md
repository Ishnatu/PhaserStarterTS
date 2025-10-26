# Phaser + TypeScript Starter

## Overview
This is a Phaser 3 game framework project using TypeScript and Vite. It's set up to run in the Replit environment with a pixel-art friendly rendering configuration.

## Project Structure
- `/src/main.ts` - Main game configuration and entry point
- `/src/scenes/` - Game scenes (BootScene loads assets, PlayScene runs the game)
- `/src/assets/` - Game assets (sprites, images, etc.)
- `index.html` - HTML entry point with pixel-art CSS
- `vite.config.ts` - Vite configuration optimized for Replit

## Features
- Phaser 3.90.0 with Canvas/WebGL rendering
- TypeScript for type safety
- Vite for fast development and builds
- Pixel-art rendering (`image-rendering: pixelated`)
- Sample player sprite with arrow key controls
- Hot Module Replacement (HMR) configured for Replit

## Tech Stack
- **Game Engine**: Phaser 3
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Physics**: Arcade Physics
- **Port**: 5000 (development)

## Recent Changes
- **October 26, 2025**: Initial import and Replit setup
  - Configured Vite for Replit environment (port 5000, host 0.0.0.0)
  - Fixed HMR websocket connection using `REPLIT_DEV_DOMAIN`
  - Added @types/node for TypeScript support
  - Fixed TypeScript errors in physics configuration
  - Configured deployment for Autoscale

## Development
The game runs on port 5000 with HMR enabled. You can use the arrow keys to move the player sprite around the checkered background. The HMR websocket is properly configured to prevent random restarts.

## Deployment
The project is configured for Autoscale deployment:
- Build: `npm run build` (compiles TypeScript and builds with Vite)
- Run: `npm run preview` (serves the built files)

## Next Steps
Potential enhancements mentioned in the README:
- Add Tileset and Tiled map loader
- Build Inventory UI and drops
- Wire input into animation states (idle/walk/attack)
