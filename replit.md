# Project Web3 — Phaser + TypeScript Starter

## Overview
A Phaser 3 game framework starter project using TypeScript and Vite. Features pixel-art friendly rendering, a basic Boot → Play scene pipeline, and a controllable player sprite.

## Current State
- ✅ Fully configured for Replit environment
- ✅ Development server running on port 5000
- ✅ TypeScript compilation working
- ✅ Game rendering with pixel-perfect graphics
- ✅ Player sprite controllable with arrow keys
- ✅ Deployment configured for Autoscale

## Project Structure
```
src/
  assets/        - Game assets (sprites, images)
  scenes/        - Phaser scenes (BootScene, PlayScene)
  main.ts        - Entry point and Phaser configuration
index.html       - HTML template
vite.config.ts   - Vite configuration (port 5000, host 0.0.0.0)
```

## Tech Stack
- **Framework**: Phaser 3.70.0
- **Language**: TypeScript 5.4.0
- **Build Tool**: Vite 5.0.0
- **Runtime**: Node.js 20

## Development
The development workflow is configured to run `npm run dev` which starts Vite dev server on port 5000.

## Game Features
- Pixel art rendering with `image-rendering: pixelated`
- 800x450 game canvas
- Arcade physics enabled
- Player sprite (32x48) scaled 3x
- Arrow key movement controls
- Checkered background pattern

## Recent Changes (Oct 26, 2025)
- Configured Vite for Replit (port 5000, host 0.0.0.0)
- Fixed TypeScript errors (gravity vector, keyboard null check)
- Added .gitignore for Node.js projects
- Set up deployment configuration for production

## Next Steps
- Add tilesets and Tiled map loader
- Build inventory UI and item drops
- Implement animation states (idle/walk/attack)
- Add more game assets
