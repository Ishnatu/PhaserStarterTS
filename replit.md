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
- **Current Placeholder Style**: Simple colored rectangles for entities, basic UI with text and buttons, dark fantasy color palette (purples, reds, blacks).
- **Target Style (Future)**: Pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere (Void corruption theme), inspired by Heroes of Might and Magic and Final Fantasy combat presentation.

### Technical Implementations
- **Game Engine**: Phaser 3.90.0 (Canvas/WebGL)
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend**: Express.js with TypeScript, running on port 3000
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect) with session-based auth
- **State Management**: Server-side PostgreSQL saves with 30-second auto-save, LocalStorage fallback for offline play
- **Core Gameplay Loop**: Main Menu -> Town (Roboka) -> Explore Map -> Delve (3-5 Rooms) -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based combat featuring d20 attack rolls against evasion, critical hits (natural 20 = brutal critical), weapon damage dice (1d4 to 2d6), and damage reduction from armor. Stamina is a key resource, with exhaustion leading to combat defeat. Combat transitions feature a 2-second fade-out "Combat Begins!" banner.
- **Combat UI**: Pokemon-style layout with enemy positioned at top right with info panel, player at bottom left with info panel, combat log in bottom left area, and action menu in bottom right corner. Menu includes Attack, Inventory (for mid-combat potion usage), and Run (50% success chance) options. Using a potion or running consumes the player's turn.
- **Stamina Emergency System**: When attempting to attack with insufficient stamina, the game automatically consumes a stamina potion if available. If no stamina potion exists or stamina remains insufficient after use, the player is forced to attempt fleeing combat.
- **Stamina Management**: Drains per tile moved (0.3333 per tile) and per attack (5 per attack). Short rests restore 50% health/stamina but carry a 30% wilderness encounter risk.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with varied room types (Combat, Boss, Treasure, Puzzle, Trap) and tier-based difficulty. Players can abandon delves and return to their entrance location.
- **Economy**: Uses Arcane Ash (AA) for common transactions and Crystalline Animus (CA) for rare items and enchantments.
- **Inventory & Equipment**: Features an 8-slot equipment system (Main Hand, Off Hand, Helmet, Chest, Legs, Boots, Shoulders, Cape) with two-handed weapon mechanics, light/heavy armor, and shields. A 15-slot active inventory bag and an 80-slot footlocker are available. Inventory UI allows equipping items from both Town and Wilderness with [Equip MH]/[Equip OH] buttons for 1-handed weapons, enabling flexible equipment changes during exploration.
- **Dual Wielding**: Any 1-handed weapon can be equipped in both Main Hand and Off Hand slots for dual wielding. When dual wielding, both weapons swing per attack (two independent attack rolls) for 5 stamina total. Each weapon can hit, miss, or crit independently. If the main hand attack kills the enemy, the off hand attack is skipped. Players can choose which slot to equip weapons into via dedicated UI buttons.
- **Armor Balancing**: Leather armor pieces (helm, legs, boots, shoulders) grant +1 evasion with no damage reduction. Heavy armor pieces (helm, legs, boots, shoulders) provide 2% damage reduction with -1 evasion penalty. Capes grant +1 evasion. Chest armor provides 10% (leather) or 20% (plate) damage reduction with evasion penalties. Shields provide +1 evasion and 10% damage reduction.
- **Loot System**: Enemies drop tier-based items, including weapons, armor, and potions.
- **Random Encounters**: Reduced frequency system (2.5% chance every 50 steps) with six encounter types: Combat (40%), Treasure (20%), Shrine to Faceless Old God (15%), Void Corruption Pocket (10%), Trapped Chest (10%), and Wandering Merchant (5%). Combat encounters display a 2-second announcement before automatically transitioning to battle.
- **Buff System**: Time-based temporary effects tracked via BuffManager. Buffs include Enraged Spirit (+5 melee damage, 1 hour), Cat'riena's Blessing (+1d4 to attack rolls, 1 hour), and Aroma of the Void (2x wilderness encounter rate until town return). All town-returning buffs clear automatically when entering Roboka.
- **Expanded Wilderness**: 3000x3000 world with camera-follow system (0.1 lerp) that smoothly tracks player movement. Eight procedurally placed delve entrances scattered across the map. Town portal marker provides instant return to Roboka (50px proximity trigger).
- **Terrain Generation**: Procedural terrain system using seeded random for deterministic world generation. Three terrain types: grass (85% with 3 color variants), dirt paths (10%), and trees (5%). Same coordinates always generate identical terrain. 32px tile size with viewport-optimized rendering.
- **Fog of War**: Three-layer exploration system with unexplored areas (black), explored but out-of-view areas (dark fog overlay at 0.6 alpha), and currently visible areas (clear terrain). 256-pixel visibility radius (8 tiles) around player. Exploration tracking uses Set-based system for O(1) lookups, synchronized with exploredTiles array for persistence. Explored areas persist across save/load cycles.
- **UI System**: All overlays use viewport-locking (setScrollFactor(0)) and interactive blocking to freeze gameplay. Menu system in wilderness (Short Rest, Inventory, Equipment, Return to Menu) and delves (Inventory, Abandon Delve, Return to Menu). Potion usage available in wilderness, between delve stages, and during combat.
- **Overlay Mechanics**: Uses isOverlayActive flag to disable player movement when menus/overlays are open, while keeping overlay buttons interactive. All UI elements tracked in arrays for proper cleanup.
- **ESC Key Navigation**: Hierarchical menu navigation using ESC key. From submenus (Inventory, Equipment) → ESC returns to main menu. From main menu → ESC closes menu. From gameplay → ESC opens quit confirmation menu.
- **Save/Load System**: Server-authoritative saves stored in PostgreSQL database. Authenticated users get persistent cloud saves with auto-save every 30 seconds. Offline mode available using LocalStorage for unauthenticated sessions.
- **Authentication System**: Login/register flow via Replit Auth (supports Google, GitHub, X, Apple, email/password). Session management handled server-side with PostgreSQL session store. Main menu shows login status and provides both authenticated and offline play options.
- **Modular Architecture**: Designed with separated concerns (scenes, systems, config, types, utils) using TypeScript and singleton patterns for managers (GameState, Scene) for extensibility.
- **HMR Configuration**: Vite dev server configured for Hot Module Replacement in Replit using WSS and `REPLIT_DEV_DOMAIN`.

### Feature Specifications
- **Town (Roboka)**: Player hub with interactive NPCs (Blacksmith, Merchant, Innkeeper, Quest Giver, Gem Expert, Marketplace).
- **Death/Respawn**: Upon defeat, the player's soul returns to Roboka.
- **Item Database**: Comprehensive database including weapons, armor, potions, and materials.
- **Potion Mechanics**: Restore health/stamina (8d4+15, averaging ~35 HP/Stamina per use).
- **Merchant System**: Comprehensive shop in Roboka featuring all base-level items (weapons 50-275 AA, armor 30-125 AA, potions 25 AA). Real-time AA/CA balance tracking with purchase validation. Wandering Merchant encounters offer rare 5% discount mobile shops in wilderness.
- **Forging & Enhancement System**: Blacksmith in Roboka provides +1 to +9 weapon/armor enhancement system with escalating risk. Each enhancement level adds +1 damage modifier; additional damage dice granted at +5, +7, and +9. Success rates decrease from 95% (+1) to 10% (+9). Failure results in no change (tiers 1-2), downgrade (tiers 3+), or item destruction (tiers 5+, up to 50% at +9). Costs scale from 100 AA/0.1 CA to 5000 AA/5.0 CA. Enhanced items display "+X" suffix (e.g., "Steel Shortsword +5").

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js 5.1
- **Database**: PostgreSQL via @neondatabase/serverless
- **ORM**: Drizzle ORM 0.44.7
- **Authentication**: openid-client 6.8.1 (Replit Auth)
- **Session Store**: connect-pg-simple 10.0.0

### Future Integrations
- **Blockchain**: Ronin Network (EVM-compatible Layer 1)
- **Wallet**: Ronin Wallet
- **NFTs**: Voidtouched Gems (Ruby, Emerald, Sapphire) representing three key elements
  - **Minting Flow**: Player mints item from game → item removed from game inventory → NFT created in wallet
  - **Import Flow**: Player buys NFT on marketplace → connects wallet → syncs to import NFT as game item
  - **Sync Triggers**: Automatic on login + manual "Sync Wallet" button during gameplay
  - **No Duplicates**: Items exist either in-game OR as NFT, never both simultaneously
- **Backend Expansion**: Server-side combat validation, economy anti-cheat, multiplayer hub
- **Hosting**: TBD (Chainstack/Liquify for Ronin RPC)

## Security Architecture

### Server-Authoritative Model (Phase 1 - Current)
- **Authentication**: Optional - supports both authenticated users and anonymous sessions
- **Session Management**: 
  - Authenticated: Secure HTTP-only cookies with 7-day expiration via Replit Auth
  - Anonymous: Client-generated session IDs stored in localStorage, sent via X-Session-Id header
- **Save Data**: Stored server-side in PostgreSQL with dual-key support (userId OR sessionId)
- **Save Priority**: Authenticated users' saves use userId (higher priority), anonymous users use sessionId
- **Migration Path**: Authentication infrastructure intact and ready to re-enable for blockchain integration

### Planned Anti-Cheat (Phase 2 - Pre-Blockchain)
Before enabling blockchain integration, the following systems will move server-side:
- **Combat Resolution**: All d20 rolls, damage calculation, and loot generation on server
- **Currency Transactions**: AA/CA earning and spending validated server-side
- **Forging System**: Enhancement attempts processed server-side with server-generated RNG
- **Inventory Management**: Server validates all item transfers and equipment changes
- **Economy Monitoring**: Rate limiting, audit logs, and anomaly detection

This prevents client-side manipulation before any in-game assets can be converted to blockchain tokens or NFTs.