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
- **Zone Rift Discovery System**: Server-authoritative zone progression. Rifts spawn at fixed locations when delve requirements are met. First-time rift interaction shows discovery prompt and calls API to mark zone discovered. Discovered zones can be accessed via Mage Tower warping.
- **Mage Tower Warp Nexus**: Town NPC replaces Quest Giver. Shows zone progress, lock status, and enables warping with tiered fees (500-2500 AA + 0-20 CA).
- **Scene Transition System**: `freshExpedition` flag controls exploration state resets for death or new games, while preserving state for normal town returns.
- **Wilderness Exploration**: 6000x6000 world with camera-follow, procedural terrain, Y-sorted rendering, fog of war, and limited rests.
- **UI System**: Viewport-locked, interactive, blocking overlays with hierarchical ESC key navigation.
- **Menu System**: Dual-menu architecture (ESC for system, M for character functions) with tabbed interface settings.
- **Audio System**: 5-track music system with smart transitions, combat memory, and volume control.
- **Modular Architecture**: Separated concerns using TypeScript and singleton patterns.
- **Services**: Innkeeper, Vault Keeper, Blacksmith for specific town functions.
- **Forging & Enhancement System**: Server-authoritative +1 to +9 enhancements with success rates, exponential CA costs (1, 2, 4, 8, 16, 32, 64, 128, 256 CA), failure penalties, and a "Shiny System." All operations occur server-side with atomic currency deduction. Total CA to +9: 511 CA.
- **Karma System**: Rewards players for returning looted tombstone items.
- **Currency Security**: Production-ready server-authoritative system with dedicated `playerCurrencies` table. Currencies stored separately from game save blob, with atomic deductions and server-side validation.
- **Stats/Level/XP Security**: Comprehensive server-authoritative system prevents client manipulation. Player stats are recalculated from equipment server-side, and forbidden fields are sanitized from client payloads.
- **Web3 Withdrawal Security (Ronin Blockchain)**: Production-ready EIP-712 signature service for converting in-game currency to on-chain ERC-20 tokens. Features include fund escrow, signed withdrawals, strict state machine, transaction locks, and robust logging. Requires `WITHDRAWAL_SIGNER_KEY` and `WITHDRAWAL_CONTRACT_ADDRESS` environment variables.
- **Item Security System**: Multi-layer protection prevents client-side item manipulation via XSS prevention, canonical reconstruction of item stats, slot compatibility validation, detection of unauthorized new items, sorted multiset matching for duplicates, and enforcement of enhancement/durability rules.
- **Starter Kit System**: New players receive a comprehensive equipment kit in their vault (footlocker) including weapons, armor, and potions. Security measures include server-authoritative whitelisting and cross-container item count aggregation.
- **Security Hardening**: Web3 withdrawals are disabled by default. Authentication is required for all game endpoints. Server validates `SESSION_SECRET`. Rate limiting is applied to APIs. Helmet.js provides security headers, and Replit provides WAF protection. RNG seeds are removed from API responses to prevent predictability exploits.
- **Server-Authoritative Economy System**: All currency transactions (combat rewards, shop purchases, item repairs, forging, soulbinding) are atomic and server-controlled. Client currency modifications are removed, with player balances exclusively sourced from server responses.
- **XP Rewards**: XP is awarded for defeating enemies and completing delves, calculated server-side.
- **Leveling System**: Cumulative XP system with levels 1-10. Per-level bonuses: +10 HP, +20 SP, +1 to-hit bonus. Level 1: 110 HP / 120 SP / +3 to-hit, Level 10: 200 HP / 300 SP / +12 to-hit. Attack bonus formula: 2 + level.

## Security Architecture

### Implemented Security Measures

#### Server-Authoritative Design
- All critical game logic runs server-side (combat, loot, XP, currency, forging)
- Save validation with rigorous payload checking
- Canonical item reconstruction - stats recalculated from database, never trusted from client
- Equipment/durability enforcement prevents client tampering
- Seeded RNG for deterministic, reproducible outcomes
- Atomic database updates for all currency transactions

#### Authentication & Session Security
- Replit Auth (OAuth2/OIDC) with secure HttpOnly cookies
- Session-based authentication on all protected endpoints
- Multi-instance detection prevents save conflicts
- Strict session TTLs with automatic cleanup

#### Rate Limiting & Request Validation
- General API: 30 requests/minute per IP (tightened from 100)
- Combat endpoints: 20 requests/minute per IP
- Loot endpoints: 5 requests/minute per IP
- Delve endpoints: 3 requests/minute per IP
- Save endpoints: 15 requests/minute per IP
- Auth endpoints: 10 attempts/15 minutes
- Security middleware validates request fingerprints
- Bot detection for automation attempts

#### Session-Based Encounter Validation (2024-11)
- **Delve Sessions**: Server-generated sessionId required for delve completion and loot claims
- **Wilderness Sessions**: Server-generated sessionId required for wilderness combat loot claims
- Loot claims require valid session (delve_* or wild_* prefix) - no fallback
- Session tracks enemy count and prevents over-claiming loot
- Tier validation clamps claimed tier to session tier (delve) or zone access (wilderness)
- Security logging for all session validation failures

#### Security Monitoring System (`server/securityMonitor.ts`)
- Comprehensive event logging with severity levels (LOW, MEDIUM, HIGH, CRITICAL)
- Player behavior tracking and anomaly detection
- IP/User-Agent change monitoring
- Request rate monitoring
- Nonce-based replay attack prevention
- Admin endpoints for security stats review

#### Input Validation & Sanitization
- All save payloads sanitized, forbidden fields stripped
- Item ID format validation (regex-based XSS prevention)
- Equipment slot compatibility validation
- Currency amount validation (prevents negative values)
- Enhancement level bounds checking

#### Anti-Cheat Measures
- Client currency/stat modifications rejected
- Stats recalculated from equipment server-side
- Enhancement levels verified against previous save state
- Item duplication detection via multiset matching
- Combat timing validation
- Currency gain rate monitoring

#### Security Headers (Helmet.js)
- Content Security Policy (CSP)
- Cross-Origin protections
- XSS protection headers

#### Privacy & Compliance
- Privacy Policy endpoint (`/api/privacy-policy`)
- Terms of Service endpoint (`/api/terms-of-service`)
- Minimal data collection (user ID, game progress only)
- No third-party tracking or analytics
- Data retention and deletion rights documented

### Security Checklist for Development

Before deploying new features:
1. [ ] All user input validated server-side
2. [ ] No client-trusted values for game logic
3. [ ] Currency/XP changes use atomic database operations
4. [ ] Rate limiting configured for new endpoints
5. [ ] Security events logged for sensitive operations
6. [ ] No secrets or API keys in client code
7. [ ] Test for edge cases and exploit attempts

### Environment Variables Required
- `SESSION_SECRET` - 32+ character secure random string (REQUIRED)
- `ADMIN_KEY` - Admin access key for security monitoring endpoints
- `DATABASE_URL` - PostgreSQL connection string
- `CLIENT_URL` - Production client URL for CORS

### Known Limitations (Infrastructure-Level)
- MFA: Relies on Replit Auth (no custom MFA implementation)
- DDoS Protection: Relies on Replit's infrastructure
- Encryption at Rest: Uses Replit's managed PostgreSQL
- Backup/DR: Uses Replit's checkpoint system

### Security TODO (Planned)
- **Server-Authoritative Combat**: Full combat migration to server APIs (client currently runs combat locally, only loot claims are validated)
- **Shrine/Tombstone Rewards**: Some non-combat encounters still have client-side reward components. Shrine offerings and tombstone looting should be fully migrated to server-validated endpoints.
- **Real-time Zone Tracking**: Server doesn't track player position in real-time; zone access validated only during session creation.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js
- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: Drizzle ORM
- **Authentication**: openid-client (Replit Auth)
- **Session Store**: connect-pg-simple