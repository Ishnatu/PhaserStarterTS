# Gemforge Chronicles

## Overview
Gemforge Chronicles is an ambitious web3 RPG game, drawing inspiration from classic turn-based games like Pokemon, Final Fantasy, and Heroes of Might and Magic, and incorporating tabletop RPG mechanics and a rich economy system. Built on Phaser 3 with TypeScript, the project aims to integrate with blockchain (Ronin network) for NFT support. The game features a core loop of town interaction, wilderness exploration, procedurally generated delves, and D20-style turn-based combat.

## User Preferences
This is a long-term solo project built collaboratively with an AI assistant. The approach:
1. User provides design vision and whitepaper
2. Work in iterative milestones
3. Use placeholder assets initially
4. User will provide final art assets
5. Focus on strong architecture to support future features

## System Architecture

### UI/UX Decisions
- **Current Visual Assets**: Pixel art city sprite for Roboka, pixel art delve entrance markers and trees, 370×510px equipment panel graphic, item sprites (shortsword). Player and NPCs are colored rectangles.
- **Typography**: VT323 monospace font (Google Fonts) for all UI text and menus, configured in `src/config/fonts.ts` with standardized sizes.
- **Currency Icons**: Pixel art coin sprites for Arcane Ash (AA) and Crystalline Animus (CA), displayed using the `CurrencyDisplay` utility.
- **Equipment Panel**: Custom pixel art 3×4 grid panel (370×510px) displaying equipped items with interactive slots. Items render as sprites scaled to 70px max dimension while preserving aspect ratio.
- **Item Sprite System**: Configurable sprite mapping via `ItemSprites` class, dynamic loading in preload, supports any sprite dimensions with automatic scaling.
- **Enhancement Color Coding**: Items display with color-coded names based on enhancement level: white (base), green (+1-3), blue (+4-6), purple (+7-8), red (+9), golden yellow (shiny).
- **Target Style (Future)**: Full pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere (Void corruption theme), inspired by Heroes of Might and Magic and Final Fantasy.

### Technical Implementations
- **Game Engine**: Phaser 3.90.0 (Canvas/WebGL)
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect) with session-based auth
- **State Management**: Server-side PostgreSQL saves with 30-second auto-save, LocalStorage fallback for offline play.
- **Core Gameplay Loop**: Main Menu -> Town (Roboka) -> Explore Map -> Delve (3-5 Rooms) -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based combat with d20 attack rolls, critical hits, weapon damage dice, and armor damage reduction. Stamina is a key resource. Combat UI is Pokemon-style with action menus (Attack, Inventory, Run). Stamina emergency system automatically consumes potions if available.
- **Stamina Management**: Drains per tile moved and per attack. Short rests restore health/stamina but risk encounters.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with varied room types and tier-based difficulty. Completed delves are removed from the map.
- **Economy**: Uses Arcane Ash (AA) for common transactions and Crystalline Animus (CA) for rare items.
- **Inventory & Equipment**: 8-slot equipment system, 15-slot active inventory, and 80-slot footlocker. Supports dual-wielding of 1-handed weapons.
- **Armor Balancing**: Various armor types provide different combinations of evasion and damage reduction.
- **Loot System**: Enemies drop tier-based items.
- **Random Encounters**: Reduced frequency system (2.5% chance every 50 steps) with six types: Combat, Treasure, Shrine, Void Corruption, Trapped Chest, Wandering Merchant.
- **Buff System**: Time-based temporary effects tracked via BuffManager, cleared upon returning to town.
- **Expanded Wilderness**: 3000x3000 world with camera-follow, procedurally placed delve entrances, and Roboka city sprite for instant return.
- **Terrain Generation**: Procedural terrain using seeded random, with grass, dirt paths, and pixel art trees. Delve exclusion zones.
- **Fog of War**: Three-layer exploration system (unexplored, explored-out-of-view, visible) with 256-pixel visibility radius.
- **UI System**: Viewport-locked overlays with interactive blocking. Hierarchical ESC key navigation.
- **Overlay Mechanics**: Uses `isOverlayActive` flag to disable player movement while menus are open.
- **Save/Load System**: Server-authoritative saves in PostgreSQL, with LocalStorage fallback.
- **Authentication System**: Login/register via Replit Auth.
- **Modular Architecture**: Separated concerns using TypeScript and singleton patterns.
- **HMR Configuration**: Vite dev server configured for Hot Module Replacement in Replit.
- **Innkeeper Rest System**: Allows players to restore health and stamina for a fee.
- **Vault Keeper Storage System**: Provides access to an 80-slot footlocker with a dual-panel UI.

### Feature Specifications
- **Town (Roboka)**: Player hub with interactive NPCs.
- **Death/Respawn**: Player respawns in Roboka upon defeat.
- **Item Database**: Comprehensive database for weapons, armor, potions, and materials.
- **Potion Mechanics**: Restore health/stamina.
- **Merchant System**: Shop in Roboka selling base items, with real-time balance tracking. Wandering Merchant encounters offer discounts.
- **Item Durability System**: Weapons and armor have durability that decays with use. Items become unusable at 0 durability and can be repaired at the blacksmith. Durability is color-coded.
- **Forging & Enhancement System**: Blacksmith offers +1 to +9 weapon/armor enhancements with varying success rates, costs, and failure penalties (downgrade or destruction). Enhancements provide damage, durability, evasion, or damage reduction bonuses.
- **Shiny System**: Rare variant items with golden nameplate that can occur during successful forging (0.5%-1.75% chance based on tier). Shiny items are immune to destruction but can still be downgraded on failure. Provides aspirational prestige goals.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js 5.1
- **Database**: PostgreSQL via @neondatabase/serverless
- **ORM**: Drizzle ORM 0.44.7
- **Authentication**: openid-client 6.8.1 (Replit Auth)
- **Session Store**: connect-pg-simple 10.0.0