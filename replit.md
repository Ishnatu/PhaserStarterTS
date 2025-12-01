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

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js
- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: Drizzle ORM
- **Authentication**: openid-client (Replit Auth)
- **Session Store**: connect-pg-simple

## Security Documentation (2024-11-30)

### Race Condition & Double-Claim Protection
Critical operations use PostgreSQL transactions with row-level locking:
- **Forging** (`/api/forge/attempt`): Full transaction with `FOR UPDATE` on game save and currency
- **Withdrawals**: All withdrawal operations use transactions (request, sign, claim, cancel)
- **Currency deduction**: Atomic `WHERE balance >= amount` prevents negative balances

Per-player operation locks prevent concurrent exploits:
- `activeForgeOperations` Set - blocks concurrent forge attempts per user
- Security event logged on blocked concurrent attempts

### Session-Based Idempotency
Single-use session tokens prevent double-claiming:
- **Wilderness encounters**: `wildernessEncounterSessions` Map with loot count tracking
- **Treasure/Shrine**: `activeTreasureSessions` Map with `claimed` boolean flag
- **Loot entitlements**: Consumed on claim, expired after 5 minutes
- Sessions validate user ownership and expiry before consumption

### Currency Anomaly Detection
Real-time monitoring for impossible resource gains (`server/securityMonitor.ts`):
- **AA threshold**: 500 AA/minute max (flags faster gains)
- **CA threshold**: 30 CA/minute max (flags faster gains)
- Anomalies logged as HIGH severity security events
- `trackCurrencyGain()` called on all reward endpoints

### Storage & Secret Management
- All secrets stored in Replit Secrets (SESSION_SECRET, DATABASE_URL, ADMIN_KEY)
- No hardcoded passwords or fallback secrets in code
- Server refuses to start without properly configured secrets
- Frontend code has zero access to environment variables

### XSS/CSRF Protection
- CSP via Helmet.js with restrictive directives
- `sanitizeUsername()` strips HTML from user input
- All text uses `textContent`/`setText()` (not innerHTML)
- Session cookies use `sameSite: 'lax'`

### Known Limitations (TODO for Production)
- In-memory session tracking lost on server restart
- Single-server design - would need Redis for multi-instance
- Daily earning counters in-memory (reset on restart)

### Anti-Bot & Anti-Cheat System (2024-12-01)
Multi-layer bot detection integrated into security middleware:

**24h Activity Pattern Detection:**
- Tracks hourly activity slots per player (UTC-based)
- Flags players active >16 hours without 4h break
- Detects "never sleeps" pattern (<4h avg sleep over 3+ days)
- Suspicion scores trigger interaction challenges at threshold

**Action Pattern Analysis:**
- Tracks action sequences (last 10 actions hashed and compared)
- Detects identical action patterns repeated 3+ times
- Action velocity tracking: flags >50 same actions in 5 minutes
- Cross-account pattern detection finds bot farms sharing sequences

**Light Interaction Challenges:**
- Non-annoying verification for highly suspicious players
- Three challenge types: math (simple arithmetic), pattern (sequence completion), timing (click within window)
- 5-minute expiry, 3 max attempts
- Passing clears flagged status

**Admin Endpoints:**
- `GET /api/admin/security/antibot` - Full anti-bot statistics
- `GET /api/challenge/status` - Check if player has pending challenge
- `POST /api/challenge/verify` - Submit challenge response

**Thresholds (configurable in securityMonitor.ts):**
- `maxConsecutiveActiveHours`: 16
- `minSleepHoursPerDay`: 4
- `actionRepetitionThreshold`: 50 per 5min
- `sequenceLength`: 10 actions
- `challengeTriggerSuspicionScore`: 5