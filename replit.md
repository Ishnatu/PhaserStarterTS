# Gemforge Chronicles

## Overview
Gemforge Chronicles is a web3 RPG, built with Phaser 3 and TypeScript, integrating classic turn-based and tabletop RPG mechanics with blockchain support for NFTs on the Ronin network. It features town interaction, wilderness exploration, procedurally generated delves, and D20-style turn-based combat. The project aims to deliver a deep, engaging RPG experience with strategic combat, economic simulation, and a dark fantasy aesthetic, targeting a rich and immersive gameplay experience and market potential.

## User Preferences
This is a long-term solo project built collaboratively with an AI assistant. The approach:
1. User provides design vision and whitepaper
2. Work in iterative milestones
3. Use placeholder assets initially
4. User will provide final art assets
5. Focus on strong architecture to support future features

## System Architecture

### UI/UX Decisions
- **Visuals**: Pixel art for environments, items, player, and enemy sprites, consistent UI spacing, simplified NPC graphics.
- **Combat UI**: Four-area design with streamlined attack selection, HP/SP bars, combat log, fixed 2x2 attack button grid, and a sidebar for Inventory/Run/End Turn.
- **Combat Backgrounds**: Two distinct pixel art backgrounds (delve, wilderness) adapting to encounter type.
- **Typography**: Press Start 2P pixel font for all UI text.
- **Target Style**: Full pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere with a Void corruption theme.
- **Town Menu Design System**: Unified design across all town menus with consistent headers, typography, and specific layouts.

### Technical Implementations
- **Game Engine**: Phaser 3.90.0, Language: TypeScript 5.4, Build Tool: Vite 5.0.
- **Backend**: Express.js with TypeScript, Database: PostgreSQL (Neon) via Drizzle ORM.
- **Authentication**: Replit Auth (OpenID Connect) with session-based authentication and multi-instance detection.
- **State Management**: Server-side PostgreSQL saves occur every 30 seconds, on scene transitions, disconnect/tab close, and after critical player interactions.
- **Core Gameplay Loop**: Main Menu -> Town -> Explore Map -> Delve -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based tactical combat with d20 rolls, critical hits, armor reduction, 2-action economy, and status conditions.
- **Server-Authoritative Design**: All critical game logic (combat, loot, XP, currency, forging) runs server-side to prevent exploitation.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with tier-based difficulty, hidden rooms, and interactive traps.
- **Economy**: Arcane Ash (common) and Crystalline Animus (rare) currencies with daily earning caps and sybil attack detection.
- **Inventory & Equipment**: 8-slot equipment, 15-slot active inventory, 80-slot footlocker. Supports dual-wielding, item durability, and 3 soulbinding slots.
- **Loot System**: Tier-based item drops with enhancement metadata. Tombstone encounters allow looting from other players.
- **Random Encounters**: Varied types (Combat, Treasure, Shrine, Corrupted Void Portal, Trapped Chest, Tombstone, Wandering Merchant), with a chance for Aetherbear boss.
- **Forging & Enhancement System**: Server-authoritative +1 to +9 enhancements with success rates, exponential CA costs, failure penalties, and a "Shiny System."
- **Web3 Withdrawal Security (Ronin Blockchain)**: Production-ready EIP-712 signature service for converting in-game currency to on-chain ERC-20 tokens.
- **Wallet Binding System**: Persistent wallet-to-account linkage with 7-day unbind cooldown, user attestation requirement, and withdrawal verification.
- **Security Architecture**: Implements server-authoritative design, authentication & session security, rate limiting, session-based encounter validation, a security monitoring system, input validation, anti-cheat measures, and security headers (CSP, input sanitization, `sameSite: 'lax'` cookies).
- **Secret Management**: All sensitive values stored in Replit Secrets; admin endpoints protected by `x-admin-key`.
- **Anti-Bot & Anti-Cheat System**: Multi-layer bot detection including 24h activity pattern detection, action pattern analysis, and light interaction challenges.
- **Client-Side Security**: Build pipeline security (disabling sourcemaps, minification, obfuscation) and a runtime integrity guard.
- **API Endpoint Security**: All game routes use `isAuthenticated` middleware, admin routes require `validateAdminAccess`, and all requests are validated using Zod schemas. Rate limiting is applied per-endpoint.
- **Database Security**: TLS enforcement, connection pooling, parameterized queries via Drizzle ORM, row-level locking, atomic currency operations, versioned migrations, and slow query monitoring.
- **Server-Side Game Logic Security**: Validates all server actions, employs idempotency and session tokens, race condition protection, and secure RNG.
- **Network Security**: HTTPS/TLS, multi-layer rate limiting, request fingerprinting, spike detection, CSRF protection, CORS configuration, Helmet.js, Zod input validation, UUIDs for entities, replay attack protection, and WAF/DDoS protection via Replit infrastructure.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js
- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: Drizzle ORM
- **Authentication**: openid-client (Replit Auth)
- **Session Store**: connect-pg-simple

## Database Operations

### Migration Workflow
The project uses Drizzle ORM with versioned migrations for production safety:

1. **Generate migration**: `npm run db:generate` - Creates timestamped SQL migration files in `/drizzle`
2. **Apply migration**: `npm run db:migrate` - Runs pending migrations against the database
3. **View schema**: `npm run db:studio` - Opens Drizzle Studio for database inspection
4. **Push (dev only)**: `npm run db:push` - Direct schema push for rapid development

Migration files are stored in `/drizzle` directory with timestamps for rollback traceability.

### Query Monitoring
Slow query monitoring is enabled with configurable thresholds:
- `SLOW_QUERY_THRESHOLD_MS`: Warning threshold (default: 1000ms)
- `CRITICAL_QUERY_THRESHOLD_MS`: Critical alert threshold (default: 5000ms)

Admin endpoints for monitoring:
- `GET /api/admin/database/query-stats` - Real-time query performance stats
- `GET /api/admin/database/slow-queries` - Historical slow query log
- `POST /api/admin/database/reset-query-stats` - Reset in-memory stats

Slow queries are automatically logged to `security_audit_log` table with severity levels.