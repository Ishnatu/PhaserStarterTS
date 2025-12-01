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
- **Visuals**: Pixel art for environments, items, player, and enemy sprites, with consistent UI spacing. NPCs use simplified graphics.
- **Combat UI**: Four-area design with streamlined attack selection, HP/SP bars, combat log, fixed 2x2 attack button grid, and a sidebar for Inventory/Run/End Turn.
- **Combat Backgrounds**: Two distinct pixel art backgrounds (delve, wilderness) that adapt to encounter type.
- **Typography**: Press Start 2P pixel font for all UI text.
- **Target Style**: Full pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere with a Void corruption theme.
- **Town Menu Design System**: Unified design across all town menus (Blacksmith, Merchant, Innkeeper, Vault Keeper, Garthek) with consistent headers, typography, and specific layouts.

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
- **Item Security System**: Multi-layer protection prevents client-side item manipulation.
- **Security Hardening**: Authentication for all game endpoints, rate limiting, Helmet.js, Replit WAF, and RNG seeds removed from API responses.
- **Leveling System**: Cumulative XP system with levels 1-10, providing per-level bonuses.
- **Security Architecture**: Implements server-authoritative design, authentication & session security, rate limiting, session-based encounter validation, a security monitoring system, input validation, anti-cheat measures, and security headers. Includes robust XSS, CSRF, and injection protection via CSP, input sanitization, safe rendering, and `sameSite: 'lax'` cookies.
- **Secret Management**: All sensitive values stored in Replit Secrets, validated at startup. Admin endpoints protected by `x-admin-key`.
- **Web3 Security**: Smart contract development guidelines (OpenZeppelin, multisig, timelocks), key management strategies (KMS, 90-day rotation), front-end signing UX, and comprehensive monitoring and incident response protocols.
- **Anti-Bot & Anti-Cheat System**: Multi-layer bot detection including 24h activity pattern detection, action pattern analysis, and light interaction challenges for suspicious players.
- **Client-Side Security**: Build pipeline security (disabling sourcemaps, minification, obfuscation) and a runtime integrity guard (`Math.random()` monitoring, global function monitoring, fetch interception, speed hack detection). All critical game logic remains server-authoritative.
- **API Endpoint Security**: All game routes use `isAuthenticated` middleware, admin routes require `validateAdminAccess`, and all requests are validated using Zod schemas. Rate limiting is applied per-endpoint.
- **Database Security**: TLS enforcement, connection pooling, parameterized queries via Drizzle ORM to prevent SQL injection, row-level locking, and atomic currency operations.
- **Server-Side Game Logic Security**: Validates all server actions, employs idempotency and session tokens, race condition protection using transactions and per-player locks, and secure RNG with deterministic seeds not exposed to clients.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js
- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: Drizzle ORM
- **Authentication**: openid-client (Replit Auth)
- **Session Store**: connect-pg-simple

## Security Architecture Documentation

### Server-Side Game Logic Security (2024-12-01)
Comprehensive audit of server-authoritative action handling:

**1. Server Action Validation:**
- All combat outcomes computed server-side via `CombatSystem`
- Enemy stats generated server-side via `EnemyFactory` with SeededRNG
- Attack validation via `WeaponValidator.validateAttack()` against stored equipment
- Loot/XP/currency awards computed server-side only
- Item enhancement/forging uses database transactions with row-level locking

**2. Idempotency & Session Tokens:**
| System | Token Type | Storage | Expiry | Consumption |
|--------|-----------|---------|--------|-------------|
| Replay Prevention | Nonce | `requestNonces` Map | 5 min | Single-use, deleted on validate |
| Combat Sessions | sessionId | `activeCombatSessions` Map | Session-based | Validated per action |
| Wilderness Encounters | token | `wildernessEncounterSessions` Map | 30 min | Loot count tracked |
| Treasure/Shrine | sessionId | `activeTreasureSessions` Map | Session-based | `claimed` boolean flag |
| Delve Sessions | sessionId | `activeDelves` Map | 2 hours | `completed` flag |
| Loot Entitlements | sessionId | `pendingLootEntitlements` Map | 5 min | `consumed` flag |
| Forge Operations | userId | `activeForgeOperations` Set | Request duration | Blocks concurrent |

**3. Race Condition Protection:**
- **Forging**: Full `db.transaction` with `FOR UPDATE` on game save + currency rows
- **Withdrawals**: Atomic nonce generation, balance deduction, and status updates
- **Currency Deduction**: Atomic SQL `WHERE balance >= amount` prevents negatives
- **Per-Player Locks**: `activeForgeOperations` Set blocks concurrent forge attempts
- **Encounter Claims**: Session tokens consumed atomically, preventing double-claims

**4. RNG Security (SeededRNG):**
- **Algorithm**: Xorshift PRNG with deterministic seed
- **Seed Creation**: `userHash + Date.now() + (tier * multiplier)` - unpredictable to clients
- **Seed Exposure**: Seeds NEVER sent to clients - only computed results
- **State Restoration**: `fastForward(callCount)` allows deterministic replay
- **Audit Trail**: All RNG calls logged with context for security review
- **Protected Operations**: Combat rolls, loot drops, enemy generation, delve layout

**5. Anti-Bot & Anti-Cheat Heuristics:**
- **24h Activity Patterns**: Flags players active >16h without 4h break
- **Action Velocity**: Detects >50 same actions in 5 minutes
- **Sequence Detection**: MD5 hash comparison of last 10 action sequences
- **Cross-Account Patterns**: Identifies bot farms sharing action sequences
- **Interaction Challenges**: Math/pattern/timing verification for suspicious players
- **Sybil Detection**: IP velocity tracking (max 3 accounts/IP/day, max 10 total)
- **Currency Anomaly**: Flags >500 AA/min or >30 CA/min gain rates

**6. Encounter Pacing (Bot Resistance):**
- **Rate Limiting**: Combat 20/min, Loot 5/min, Delve 3/min
- **Session Validation**: Each encounter requires valid server-generated token
- **Tier Clamping**: Client-claimed tier clamped to session's validated tier
- **Loot Count Tracking**: Wilderness sessions track loot claims, flag excess

**7. Load/Stability Measures:**
- Express rate limiting with sliding window per endpoint
- PostgreSQL connection pooling via Neon serverless
- Session cleanup intervals (15s for heartbeats, 5min for expired tokens)
- Memory-bounded audit logs (max 10,000 RNG entries, 10,000 security events)
- Graceful error handling with generic messages (no stack traces to client)

**8. Withdrawal Security:**
- Database-stored daily withdrawal cap (MAX_DAILY_WITHDRAWALS = 3/day)
- Per-transaction balance check and atomic deduction
- Atomic nonce generation via `FOR UPDATE` lock
- Status transitions: pending → signed → claimed
- AuditLogger tracks all withdrawal events with severity levels

**Known Limitations (Single Instance):**
- Session tokens (combat, encounter, delve) stored in-memory Maps
- On server restart, active sessions are lost (players must re-initiate)
- Not suitable for horizontal scaling without Redis/distributed session store
- Acceptable for current target: ~10 concurrent players on single Replit instance

### API Endpoint Security
- All game routes use `isAuthenticated` middleware
- Admin routes require `validateAdminAccess` with 32+ char ADMIN_KEY
- Request validation via centralized Zod schemas in `server/validation/`
- Rate limiting per endpoint (combat: 20/min, loot: 5/min, delve: 3/min)