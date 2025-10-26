# Project Web3 — Phaser + TypeScript Starter

**What you get**
- Phaser 3 + TypeScript + Vite
- Pixel-art friendly rendering (`image-rendering: pixelated`)
- BootScene -> PlayScene pipeline
- A sample 32x48 player sprite (`src/assets/player.png`)

## Run locally (or on Replit)
```bash
npm i
npm run dev
```
Then open the URL Vite prints (default http://localhost:5173).

## Add assets
- Put images into `src/assets/`
- Load them in `BootScene.ts`
- Use texture atlases if you prefer (Phaser supports JSON hash/array).

## Next steps
- Add a Tileset and a Tiled map loader.
- Build Inventory UI and drops.
- Wire input into animation states (idle / walk / attack).
