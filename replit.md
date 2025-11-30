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
- **Typography**: Press Start 2P pixel font for all UI text.
- **Target Style**: Full pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere with a Void corruption theme.
- **Town Menu Design System**: Unified design across all town menus (Blacksmith, Merchant, Innkeeper, Vault Keeper, Garthek) with consistent headers, typography, and specific layouts.

### Technical Implementations
- **Game Engine**: Phaser 3.90.0, Language: TypeScript 5.4, Build Tool: Vite 5.0.
- **Backend**: Express.js with TypeScript, Database: PostgreSQL (Neon) via Drizzle ORM.
- **Authentication**: Replit Auth (OpenID Connect) with session-based authentication. Multi-instance detection prevents save conflicts.
- **State Management**: Server-side PostgreSQL saves occur every 30 seconds, on scene transitions, disconnect/tab close, and after critical player interactions (combat exit, purchases, forging, etc.).
- **Core Gameplay Loop**: Main Menu -> Town -> Explore Map -> Delve -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based tactical combat with d20 rolls, critical hits, armor reduction, 2-action economy, and status conditions.
- **Server-Authoritative Design**: All critical game logic (combat, loot, XP, currency, forging) runs server-side to prevent exploitation. Secure API endpoints validate player data.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with tier-based difficulty, hidden rooms, and interactive traps.
- **Economy**: Arcane Ash (common) and Crystalline Animus (rare) currencies.
- **Inventory & Equipment**: 8-slot equipment, 15-slot active inventory, 80-slot footlocker. Supports dual-wielding, item durability, and 3 soulbinding slots.
- **Loot System**: Tier-based item drops with enhancement metadata. Tombstone encounters allow looting from other players.
- **Random Encounters**: Varied types (Combat, Treasure, Shrine, Corrupted Void Portal, Trapped Chest, Tombstone, Wandering Merchant), with a chance for Aetherbear boss.
- **Forging & Enhancement System**: Server-authoritative +1 to +9 enhancements with success rates, exponential CA costs, failure penalties, and a "Shiny System."
- **Web3 Withdrawal Security (Ronin Blockchain)**: Production-ready EIP-712 signature service for converting in-game currency to on-chain ERC-20 tokens.
- **Item Security System**: Multi-layer protection prevents client-side item manipulation via XSS prevention, canonical reconstruction of item stats, slot compatibility validation, and enforcement of enhancement/durability rules.
- **Security Hardening**: Authentication required for all game endpoints, rate limiting, Helmet.js for security headers, Replit WAF protection, and RNG seeds removed from API responses.
- **Server-Authoritative Economy System**: All currency transactions are atomic and server-controlled.
- **Leveling System**: Cumulative XP system with levels 1-10, providing per-level bonuses to HP, SP, and to-hit.
- **Security Architecture**: Implements server-authoritative design, authentication & session security, rate limiting, session-based encounter validation, a security monitoring system, input validation, anti-cheat measures, and security headers.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js
- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: Drizzle ORM
- **Authentication**: openid-client (Replit Auth)
- **Session Store**: connect-pg-simple

## Security Architecture

### Server-Authoritative Encounter System (2024-11-30)
**Closed Exploit**: Previously, trap encounters allowed client-driven session creation, enabling unlimited currency farming. Now fully server-authoritative.

**Architecture**:
- **PendingEncounterManager** (`server/encounters/PendingEncounterManager.ts`): Tracks player movement server-side, spawns encounters with SeededRNG, generates cryptographic tokens, validates/consumes tokens
- **Movement Reporting**: Client reports position to `/api/exploration/move`; server decides if encounters spawn
- **Encounter Tokens**: All encounter rewards require valid token from `validateAndConsumeEncounter()`
- **Supported Encounters**: Combat, Treasure, Shrine, Trapped Chest all use server tokens

**Endpoints**:
- `/api/exploration/move` - Process movement, return encounter spawns
- `/api/exploration/start` - Reset exploration state
- `/api/exploration/end` - Clear pending encounters
- `/api/encounter/trap/attempt` - Requires encounterToken
- `/api/encounter/treasure/claim` - Requires encounterToken
- `/api/encounter/shrine/offer` - Requires encounterToken
- `/api/encounter/skip` - Consume unused encounter tokens

**Security Features**:
- Zone access validation against discovered zones
- Cryptographic token generation (24-byte random)
- 5-minute token expiry
- Movement distance validation (max 200px per call)
- Comprehensive security logging

### Rate Limiting
- General API: 30 requests/minute per IP
- Combat endpoints: 20 requests/minute per IP
- Loot endpoints: 5 requests/minute per IP
- Delve endpoints: 3 requests/minute per IP
- Save endpoints: 15 requests/minute per IP

### Security TODO
- **Tombstone Looting**: Still has client-side components, should be migrated to server endpoints