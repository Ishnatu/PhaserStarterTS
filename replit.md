# Gemforge Chronicles

## Overview
Gemforge Chronicles is an ambitious web3 RPG inspired by classic turn-based games, integrating tabletop RPG mechanics, a rich economy, and blockchain (Ronin network) for NFT support. Built on Phaser 3 with TypeScript, it features town interaction, wilderness exploration, procedurally generated delves, and D20-style turn-based combat. The project aims to deliver a deep, engaging RPG experience with strategic combat, economic simulation, and a dark fantasy aesthetic.

## User Preferences
This is a long-term solo project built collaboratively with an AI assistant. The approach:
1. User provides design vision and whitepaper
2. Work in iterative milestones
3. Use placeholder assets initially
4. User will provide final art assets
5. Focus on strong architecture to support future features

## System Architecture

### UI/UX Decisions
- **Visuals**: Pixel art for environments, items, player, and enemy sprites. NPCs use colored rectangles or custom circular shop button sprites. Consistent UI spacing and layout for menus.
- **Combat UI**: Four-area design with streamlined attack selection, HP/SP bars, detailed combat log, fixed 2x2 attack button grid with pagination, and a sidebar for Inventory/Run/End Turn.
- **Combat Backgrounds**: Two distinct pixel art backgrounds (delve, wilderness) that adapt to encounter type, with specific player and enemy positioning.
- **Combat Animations**: Player lunge animation for attacks and red hit flash for damage.
- **Typography**: Press Start 2P pixel font for all UI text, with varying sizes and `resolution: 2` for crisp rendering.
- **Currency Icons**: Pixel art sprites for Arcane Ash and Crystalline Animus.
- **Equipment Panel**: Custom pixel art 3x4 grid for interactive item slots.
- **Item Enhancement Visuals**: Color-coded item names based on enhancement level.
- **Enemy Sprites**: Tier 1-2 enemies have pixel art sprites; bosses are scaled larger. Fallback to colored rectangles for missing sprites.
- **Stats Panel**: Unified `StatsPanel` component displays player vitals (HP/SP, currency, evasion, DR, level) with consistent icon-based positioning and dynamic spacing.
- **Town Menu Design System**: Unified design for all town menus (Blacksmith, Merchant, Innkeeper, Vault Keeper, Garthek) with consistent header layout, typography, spacing, and specific tab/column layouts for each.
- **Target Style**: Full pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere with a Void corruption theme, inspired by Heroes of Might and Magic and Final Fantasy.

### Technical Implementations
- **Game Engine**: Phaser 3.90.0, Language: TypeScript 5.4, Build Tool: Vite 5.0.
- **Backend**: Express.js with TypeScript, Database: PostgreSQL (Neon) via Drizzle ORM.
- **Authentication**: Replit Auth (OpenID Connect) with session-based authentication using `express-session` and PostgreSQL store. Multi-instance detection prevents save conflicts.
- **State Management**: Server-side PostgreSQL saves with 30-second auto-save, auto-save on all scene transitions (delve↔wilderness, wilderness↔town), and emergency saves on disconnect/tab close via `sendBeacon` API.
- **Enemy System**: Metadata-driven enemy database (`EnemyFactory.ts`) supporting 15 enemy types across 5 tiers, with defined currency rewards and category-based loot probabilities.
- **Core Gameplay Loop**: Main Menu -> Town -> Explore Map -> Delve -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based tactical combat with d20 rolls, critical hits, armor reduction, 2-action economy, and various status conditions (weakened, empowered, etc.).
- **Server-Authoritative Combat**: All combat calculations occur server-side with deterministic RNG to prevent exploitation. This includes server-side `EnemyFactory`, `WeaponValidator`, and secure API endpoints (`/api/combat/initiate`, `/api/combat/action`) that reload player data from storage for validation.
- **Enemy Special Attacks**: Tier 1 enemies have unique special abilities with specific probabilities (e.g., Splooge, Poison Barb, Agonizing Bite, Shrill Touch, Shiny Shiny, Chronostep, Mighty Roar, Crushing Slam).
- **Stamina Management**: Stamina drains per tile moved and per attack; short rests restore.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with tier-based difficulty, hidden rooms, and interactive traps.
- **Economy**: Arcane Ash (common) and Crystalline Animus (rare) currencies.
- **Inventory & Equipment**: 8-slot equipment, 15-slot active inventory, 80-slot footlocker. Supports dual-wielding, item durability, and soulbinding (3 slots).
- **Loot System**: Tier-based item drops with enhancement metadata. Tombstone encounters allow looting from other players.
- **Random Encounters**: Varied types (Combat, Treasure, Shrine, Corrupted Void Portal, Trapped Chest, Tombstone, Wandering Merchant), with a chance for Aetherbear boss in combat.
- **Buff System**: Time-based temporary effects managed by `BuffManager`.
- **Wilderness Exploration**: 6000x6000 world with camera-follow, procedural terrain, Y-sorted rendering, fog of war, and limited rests.
- **UI System**: Viewport-locked, interactive, blocking overlays with hierarchical ESC key navigation.
- **Menu System**: Dual-menu architecture (ESC for system, M for character functions) with tabbed interface settings.
- **Audio System**: 5-track music system with smart transitions, combat memory, volume control, and graceful handling of missing files.
- **Modular Architecture**: Separated concerns using TypeScript and singleton patterns.
- **Services**: Innkeeper, Vault Keeper, Blacksmith for specific town functions.
- **Forging & Enhancement System**: +1 to +9 enhancements with success rates, costs, failure penalties, and a "Shiny System" for rare, indestructible items.
- **Karma System**: Rewards players for returning looted tombstone items.
- **Currency Security**: Production-ready server-authoritative currency system with dedicated `playerCurrencies` table. Currencies stored separately from game save blob to prevent client tampering. Save endpoint rejects payloads containing currency fields. Load endpoint injects server-authoritative values. Atomic `deductCrystallineAnimus` prevents TOCTOU exploits. Migration script backfills legacy saves with clamped values. INSERT-ONLY `ensurePlayerCurrency` method prevents existing balance overwrites. Soulbinding costs 1 CA per newly bound item, deducted atomically server-side.
- **Web3 Withdrawal Security (Ronin Blockchain)**: Production-ready EIP-712 signature service for converting in-game currency to on-chain ERC-20 tokens. Withdrawal flow: (1) Request escrowed (funds immediately deducted), (2) Server generates EIP-712 permit signature (15min expiry), (3) Player submits to Ronin smart contract. Security features: fund escrow prevents double-spend, signed withdrawals cannot be cancelled (signature validity locked), strict state machine (pending→signed→claimed), transaction locks prevent race conditions, contract address validation blocks spoofing exploits, monotonic nonces with UNIQUE constraint, daily limits (3/day), amount caps (AA: 10k, CA: 1k), critical audit logging. Requires WITHDRAWAL_SIGNER_KEY and WITHDRAWAL_CONTRACT_ADDRESS environment variables. **Production deployment requires AWS KMS or HashiCorp Vault for signing key management** (Replit Secrets insufficient for production mainnet).

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js 5.1
- **Database**: PostgreSQL via @neondatabase/serverless
- **ORM**: Drizzle ORM 0.44.7
- **Authentication**: openid-client 6.8.1 (Replit Auth)
- **Session Store**: connect-pg-simple 10.0.0