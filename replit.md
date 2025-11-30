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

## Economic Security (Anti-Bot/Sybil Measures)

### Daily Earning Caps (2024-11-30)
Prevents multi-account farming and bot exploitation:

**Per-Account Daily Limits:**
- Trap attempts: 10/day
- Treasure claims: 8/day  
- Shrine offers: 5/day
- Maximum AA from encounters: 1,000 per character level (Level 1 = 1,000/day, Level 10 = 10,000/day)
- Maximum CA from encounters: 100/day (flat)

**Reward Structure Changes:**
- **Treasure**: No longer gives free currency - requires combat victory against guardian
- **Traps**: 40% success rate (down from 60%), rewards reduced to 20-40 AA + 1-3 CA
- **Shrines**: 70% chance of nothing (risk-reward preserved), CA rewards reduced to 3-6

**API Endpoint:**
- `GET /api/encounter/daily-status` - Returns player's daily cap usage

### Sybil Attack Detection (2024-11-30)
IP velocity tracking to detect multi-account operations:

**Thresholds:**
- Max 3 new accounts per IP per 24 hours
- Max 5 different account logins per IP per hour
- Blocking after 6+ accounts from same IP in 24h

**Detection Functions:**
- `trackAccountCreation()` - Monitors new account velocity per IP
- `trackAccountLogin()` - Detects account switching patterns
- `isIPFlagged()` - Check if IP is flagged for suspicious activity
- `getIPTrackingStats()` - Admin stats for flagged IPs

**Security Events Logged:**
- `SYBIL_ACCOUNT_VELOCITY` (CRITICAL) - Too many accounts from one IP
- `SYBIL_LOGIN_VELOCITY` (HIGH) - Too many account switches
- `TRAP_DAILY_CAP_REACHED` / `TREASURE_DAILY_CAP_REACHED` / `SHRINE_DAILY_CAP_REACHED` (MEDIUM)

### Bot Detection (Existing)
From `securityMonitor.ts`:
- User-agent pattern matching (curl, wget, selenium, headless, etc.)
- Request rate anomaly detection (120 req/min threshold)
- Missing browser headers detection
- Combat timing validation (minimum 2 sec/enemy)

## Authentication & Session Security (2024-11-30)

### Architecture
- **Provider**: Replit Auth via OpenID Connect (no custom JWTs)
- **Session Store**: PostgreSQL via `connect-pg-simple` (server-side, not localStorage)
- **Token Refresh**: Automatic OIDC refresh token flow in `isAuthenticated` middleware

### Cookie Security
```javascript
cookie: {
  name: 'gfc.sid',        // Custom name to prevent fingerprinting
  httpOnly: true,         // XSS protection - JS cannot access cookie
  secure: true,           // HTTPS only
  sameSite: 'lax',        // CSRF protection (allows OAuth redirects)
  maxAge: 7 days
}
```

### Session Secret
- Validated at startup to be 32+ characters
- Server refuses to start if SESSION_SECRET is missing or too short
- See `validateEnvironment()` in `server/index.ts`

### Sybil Tracking Integration
- `trackAuthEvent()` called on every login/signup
- New accounts trigger `trackAccountCreation()` for IP velocity checks
- Returning users trigger `trackAccountLogin()` for account-switch detection
- Suspicious activity logged as SYBIL_NEW_ACCOUNT or SYBIL_LOGIN_PATTERN

### Logout
- `POST /api/auth/logout` destroys server-side session
- `GET /api/logout` calls Replit OIDC end-session endpoint

## Web3 Security Checklist (Pre-Mainnet)

### Smart Contract Development
- [ ] Use OpenZeppelin contracts (ERC-20, ERC-721, AccessControl, Pausable, ReentrancyGuard)
- [ ] Implement multisig admin (2-of-3 Gnosis Safe) for all privileged functions
- [ ] Add timelocks for critical operations (signer updates, pause/unpause)
- [ ] Integer overflow protection (automatic in Solidity 0.8+)
- [ ] No on-chain randomness for critical outcomes (server-side SeededRNG already used)
- [ ] External security audit (CertiK, OpenZeppelin, or Quantstamp)

### Key Management
- [ ] Migrate WITHDRAWAL_SIGNER_KEY from env vars to AWS KMS or HashiCorp Vault
- [ ] Implement 90-day key rotation with HSM-backed keys
- [ ] Set up break-glass emergency procedures
- [ ] Enable audit logging for all signing operations
- [ ] IAM roles with time-limited sessions and MFA

### Front-End Signing UX
- [ ] Human-readable signing prompts showing exact amounts and contract address
- [ ] No blind-sign typed data - always display what's being signed
- [ ] Contract address verification display before signing
- [ ] Clear rejection of malformed or unexpected signing requests

### Monitoring & Incident Response
- [ ] Alert on >10 signatures/minute per player
- [ ] Alert on >100,000 AA or >10,000 CA withdrawn in 1 hour
- [ ] SIEM integration for audit log analysis
- [ ] Reconciliation jobs comparing PostgreSQL vs on-chain events
- [ ] Circuit breaker testing (emergency pause)
- [ ] Documented incident response runbooks

### Current Status
- **Withdrawals**: Disabled via feature flag (ENABLE_WEB3_WITHDRAWALS)
- **Contracts**: Not yet deployed (by design for development phase)
- **Signing Key**: Environment variable (development only - NOT production safe)