# Gemforge Chronicles

## Overview
Gemforge Chronicles is a web3 RPG, built with Phaser 3 and TypeScript, integrating classic turn-based and tabletop RPG mechanics with blockchain support for NFTs on the Ronin network. It features town interaction, wilderness exploration, procedurally generated delves, and D20-style turn-based combat. The project aims to deliver a deep, engaging RPG experience with strategic combat, economic simulation, and a dark fantasy aesthetic, targeting a rich and immersive gameplay experience.

## User Preferences
This is a long-term solo project built collaboratively with an AI assistant. The approach:
1. User provides design vision and whitepaper
2. Work in iterative milestones
3. Use placeholder assets initially
4. User will provide final art assets
5. Focus on strong architecture to support future features

## System Architecture

### UI/UX Decisions
- **Visuals**: Pixel art for environments, items, player, and enemy sprites, with consistent UI spacing. NPCs use simplified graphics.
- **Combat UI**: Four-area design with streamlined attack selection, HP/SP bars, combat log, fixed 2x2 attack button grid, and a sidebar for Inventory/Run/End Turn.
- **Combat Backgrounds**: Two distinct pixel art backgrounds (delve, wilderness) that adapt to encounter type.
- **Combat Animations**: Player lunge animation and red hit flash for damage.
- **Typography**: Press Start 2P pixel font for all UI text.
- **Currency Icons**: Pixel art sprites for Arcane Ash and Crystalline Animus.
- **Equipment Panel**: Custom pixel art 3x4 grid for interactive item slots.
- **Item Enhancement Visuals**: Color-coded item names based on enhancement level.
- **Enemy Sprites**: Tier 1-2 enemies have pixel art; bosses are scaled larger. Fallback to colored rectangles for missing sprites.
- **Stats Panel**: Unified component displays player vitals with consistent icon-based positioning.
- **Town Menu Design System**: Unified design across all town menus (Blacksmith, Merchant, Innkeeper, Vault Keeper, Garthek) with consistent headers, typography, and specific layouts.
- **Target Style**: Full pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere with a Void corruption theme.

### Technical Implementations
- **Game Engine**: Phaser 3.90.0, Language: TypeScript 5.4, Build Tool: Vite 5.0.
- **Backend**: Express.js with TypeScript, Database: PostgreSQL (Neon) via Drizzle ORM.
- **Authentication**: Replit Auth (OpenID Connect) with session-based authentication using `express-session` and PostgreSQL. Multi-instance detection prevents save conflicts.
- **State Management**: Server-side PostgreSQL saves every 30 seconds, on all scene transitions, and on disconnect/tab close. Throttled movement saves persist position/stamina during exploration. Critical saves occur after all key player interactions (e.g., combat exit, trap success/failure, treasure collection, purchases, forging).
- **Enemy System**: Metadata-driven enemy database supporting 15 enemy types across 5 tiers with defined currency rewards and loot probabilities.
- **Core Gameplay Loop**: Main Menu -> Town -> Explore Map -> Delve -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based tactical combat with d20 rolls, critical hits, armor reduction, 2-action economy, and status conditions.
- **Server-Authoritative Combat**: All combat calculations, including deterministic RNG, occur server-side to prevent exploitation. Secure API endpoints validate player data.
- **Enemy Special Attacks**: Tier 1 enemies have unique special abilities with specific probabilities.
- **Stamina Management**: Stamina drains per tile moved and per attack; short rests restore.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with tier-based difficulty, hidden rooms, and interactive traps.
- **Economy**: Arcane Ash (common) and Crystalline Animus (rare) currencies.
- **Inventory & Equipment**: 8-slot equipment, 15-slot active inventory, 80-slot footlocker. Supports dual-wielding, item durability, and 3 soulbinding slots.
- **Loot System**: Tier-based item drops with enhancement metadata. Tombstone encounters allow looting from other players.
- **Random Encounters**: Varied types (Combat, Treasure, Shrine, Corrupted Void Portal, Trapped Chest, Tombstone, Wandering Merchant), with a chance for Aetherbear boss.
- **Buff System**: Time-based temporary effects managed by `BuffManager`.
- **Tier 2 Zone - Fungal Hollows**: Unlocks after completing 5 T1 delves, featuring harder enemies.
- **Scene Transition System**: `freshExpedition` flag controls exploration state resets for death or new games, while preserving state for normal town returns.
- **Wilderness Exploration**: 6000x6000 world with camera-follow, procedural terrain, Y-sorted rendering, fog of war, and limited rests.
- **UI System**: Viewport-locked, interactive, blocking overlays with hierarchical ESC key navigation.
- **Menu System**: Dual-menu architecture (ESC for system, M for character functions) with tabbed interface settings.
- **Audio System**: 5-track music system with smart transitions, combat memory, and volume control.
- **Modular Architecture**: Separated concerns using TypeScript and singleton patterns.
- **Services**: Innkeeper, Vault Keeper, Blacksmith for specific town functions.
- **Forging & Enhancement System**: Server-authoritative +1 to +9 enhancements with success rates, costs, failure penalties, and a "Shiny System." All operations occur server-side with atomic currency deduction.
- **Karma System**: Rewards players for returning looted tombstone items.
- **Currency Security**: Production-ready server-authoritative system with dedicated `playerCurrencies` table. Currencies stored separately from game save blob, with atomic deductions and server-side validation.
- **Stats/Level/XP Security**: Comprehensive server-authoritative system prevents client manipulation. Player stats are recalculated from equipment server-side, and forbidden fields are sanitized from client payloads.
- **Web3 Withdrawal Security (Ronin Blockchain)**: Production-ready EIP-712 signature service for converting in-game currency to on-chain ERC-20 tokens. Features include fund escrow, signed withdrawals, strict state machine, transaction locks, and robust logging. Requires `WITHDRAWAL_SIGNER_KEY` and `WITHDRAWAL_CONTRACT_ADDRESS` environment variables.
- **Item Security System**: Multi-layer protection prevents client-side item manipulation via XSS prevention, canonical reconstruction of item stats, slot compatibility validation, detection of unauthorized new items, sorted multiset matching for duplicates, and enforcement of enhancement/durability rules.
- **Starter Kit System**: New players receive a comprehensive equipment kit in their vault (footlocker) including weapons, armor, and potions. Security measures include server-authoritative whitelisting and cross-container item count aggregation.
- **Security Hardening**: Web3 withdrawals are disabled by default. Authentication is required for all game endpoints. Server validates `SESSION_SECRET`. Rate limiting is applied to APIs. Helmet.js provides security headers, and Replit provides WAF protection. RNG seeds are removed from API responses to prevent predictability exploits.
- **Server-Authoritative Economy System**: All currency transactions (combat rewards, shop purchases, item repairs, forging, soulbinding) are atomic and server-controlled. Client currency modifications are removed, with player balances exclusively sourced from server responses.
- **XP Rewards**: XP is awarded for defeating enemies and completing delves, calculated server-side.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js
- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: Drizzle ORM
- **Authentication**: openid-client (Replit Auth)
- **Session Store**: connect-pg-simple