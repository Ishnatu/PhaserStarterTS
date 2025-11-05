# Gemforge Chronicles

## Overview
Gemforge Chronicles is an ambitious web3 RPG game, drawing inspiration from classic turn-based games like Pokemon, Final Fantasy, and Heroes of Might and Magic, and incorporating tabletop RPG mechanics and a rich economy system. Built on Phaser 3 with TypeScript, the project aims to integrate with blockchain (Ronin network) for NFT support. The game features a core loop of town interaction, wilderness exploration, procedurally generated delves, and D20-style turn-based combat.

## Recent Changes
- **Cleaving Attack Armor Fix**: Fixed Sweeping Strike to properly calculate cleave damage with individual enemy armor reduction. Previously, cleave damage was based on final damage dealt to primary target (ignoring adjacent enemies' armor values). Now correctly applies 75% of base weapon damage to each adjacent enemy, with proper armor reduction per target.
- **Combat Ending Immediate Victory Check**: Combat now ends immediately when last enemy is defeated, regardless of remaining player actions. Added checkCombatEnd() calls after all attack types (standard, special, AoE, shield abilities) to prevent combat from waiting for manual turn end after victory.
- **2-Action Economy Combat System**: Complete action economy implementation - players get 2 actions per turn that reset at turn start. Light attacks (1 action) allow tactical combinations: 2 light attacks, light attack + potion, or save actions. Heavy attacks (2 actions) end turn immediately. Combat UI displays "Actions: X/2" counter, "End Turn" button for manual turn end, and visual feedback (green=available, red=no stamina, gray=no actions). All attack paths (including dual-wield) properly deduct actions and check turn end conditions.
- **Tactical Combat System Overhaul**: Complete reimplementation of combat with Pokemon-style attack selection UI. Each weapon type now has 2-4 unique attacks with different stamina costs (3-20), action costs (1-2), and damage multipliers (1x-3x). Special attacks include: backstab (3x damage, crit 19-20), multi-hit chains (Puncture 3x, Viper's Fangs), AoE/cleave (Sweeping Strike, Arcing Blade, Murderous Intent), defensive buffs, vampiric healing, and Crimson Mist instant-kill. Combat UI displays "STAM X" and "ATK X" for each attack option. Improved multi-strike messaging (Vipers Fangs shows "missed" instead of "0 damage" for failed second strike).
- **Status Condition System**: Full D&D-style status effects with ConditionManager tracking stacks, duration, and tick damage. Implemented stunned (skip turn), poisoned (2 damage/tick), bleeding (1-3 damage/tick), and dependable (+2 evasion) conditions. Visual indicators display as colored squares above enemy portraits (grey=stunned, green=poisoned, red=bleeding) with stack numbers.
- **Void Portal Respawn Fix**: returnToLocation now properly maintained through entire encounter chain (DelveScene, CombatScene, ExploreScene). Players return to correct wilderness position after void portal encounters instead of being sent to Roboka.
- **Multi-Instance Detection System**: Prevents save conflicts by detecting when multiple game instances are running simultaneously. Heartbeat system (5-second intervals) identifies duplicate sessions and displays a blocking modal that forces game exit. Auto-closes duplicate tabs after 10 seconds. Separates stable playerId (shared across tabs in localStorage) from unique instanceId (per-tab) for accurate detection.
- **Gameplay Balance Enhancements**: T1 zone random encounters now limited to max 1 T2 enemy for better new player balance. Wandering Merchant upgraded to sell 3 enhanced items (+1/+2) with pricing formula: (base + cumulative forge costs) * 1.5. Corrupted Void Portal (renamed from Void Corruption) converted to 2-stage mini-delve with tier-appropriate enemies in stage 1 and guaranteed T1 boss in stage 2.
- **Soulbinding & Karma System**: Complete extraction game mechanics implemented - Garthek the Stitcher NPC allows binding up to 3 equipment slots to soul (soulbound items return on death). Karma system rewards players who return looted tombstone items via Halls of Virtue. Keeper of Virtue NPC shows leaderboard and unclaimed returns.
- **Tombstone Encounters**: 5% random encounter chance to find other players' tombstones with lootable items. Full inventory overflow handling with item selection UI.
- **Enhanced Wilderness Visuals**: Added pixel art bushes and grass tufts (2 variants) scattered procedurally across terrain for visual depth and atmosphere.
- **ESC Key Universal Fix**: Simplified handleEscapeKey() to work with all overlays using currentMenuCloseFunction, fixing karma prompts and future UIs.
- **Enhanced trap room system**: Interactive trap rooms with D20 disarm checks (DC scales with tier: T1=8, T2=10, etc.). Failed disarms trigger dramatic choice system (Duck vs Leap) against randomized trap types (spike/dart) with 2d10+4 damage for wrong choices.
- **Mystery delve navigation**: Room types now hidden until entered - unvisited rooms display as '???' to maintain suspense and exploration tension.
- **Potion usage in combat**: Using potions from inventory consumes player's turn (existing emergency stamina potion system preserved).

## User Preferences
This is a long-term solo project built collaboratively with an AI assistant. The approach:
1. User provides design vision and whitepaper
2. Work in iterative milestones
3. Use placeholder assets initially
4. User will provide final art assets
5. Focus on strong architecture to support future features

## System Architecture

### UI/UX Decisions
- **Current Visual Assets**: Pixel art city sprite for Roboka, pixel art delve entrance markers, trees, bushes, and grass tufts for wilderness decoration, 370×510px equipment panel graphic, item sprites (shortsword), tombstone sprite. Player and NPCs are colored rectangles.
- **Typography**: VT323 monospace font (Google Fonts) for all UI text and menus, configured in `src/config/fonts.ts` with standardized sizes.
- **Currency Icons**: Pixel art coin sprites for Arcane Ash (AA) and Crystalline Animus (CA), displayed using the `CurrencyDisplay` utility.
- **Equipment Panel**: Custom pixel art 3×4 grid panel (370×510px) displaying equipped items with interactive slots. Items render as sprites scaled to 70px max dimension while preserving aspect ratio. Click-to-equip functionality: clicking a slot shows a dropdown menu of equippable items with durability info and "[Equip]" buttons.
- **Item Sprite System**: Configurable sprite mapping via `ItemSprites` class, dynamic loading in preload, supports any sprite dimensions with automatic scaling.
- **Enhancement Color Coding**: Items display with color-coded names based on enhancement level: white (base), green (+1-3), blue (+4-6), purple (+7-8), red (+9), golden yellow (shiny).
- **Equipped Item Indicators**: Items currently equipped display "[E]" marker in forge UI, allowing enhancement and repair while maintaining equipped status.
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
- **D20 Combat System**: Turn-based tactical combat with d20 attack rolls, critical hits, and armor damage reduction. Pokemon-style UI with Attack/Inventory/Run menus. Each weapon type has 2-4 unique attacks with variable stamina costs, action costs, and damage multipliers. Special mechanics include status conditions (stunned, poisoned, bleeding, dependable), multi-hit combos, AoE cleaves, backstabs, vampiric healing, and instant-kill finishers. Enemies use simplified combat (basic attacks), players get full tactical depth. Stamina emergency system automatically consumes potions if available.
- **Stamina Management**: Drains per tile moved (0.33/sec) and per attack (5 stamina). Short rests in wilderness (M menu) restore 50% health/stamina with 30% encounter risk. Combat system validates stamina before allowing attacks.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with varied room types and tier-based difficulty. Completed delves are removed from the map.
- **Economy**: Uses Arcane Ash (AA) for common transactions and Crystalline Animus (CA) for rare items.
- **Inventory & Equipment**: 8-slot equipment system, 15-slot active inventory, and 80-slot footlocker. Supports dual-wielding of 1-handed weapons.
- **Armor Balancing**: Various armor types provide different combinations of evasion and damage reduction.
- **Loot System**: Enemies drop tier-based items.
- **Random Encounters**: Reduced frequency system (2.5% chance every 50 steps) with seven types: Combat (38%, max 1 T2 enemy in groups), Treasure (20%), Shrine (15%), Corrupted Void Portal (10%, 2-stage mini-delve), Trapped Chest (10%), Tombstone (5%), Wandering Merchant (2%, sells 3 enhanced items).
- **Buff System**: Time-based temporary effects tracked via BuffManager, cleared upon returning to town.
- **Expanded Wilderness**: 3000x3000 world with camera-follow, procedurally placed delve entrances, and Roboka city sprite for instant return.
- **Terrain Generation**: Procedural terrain using seeded random, with grass (3 color variants), dirt paths, pixel art trees (3 variants), bushes, and grass tufts (2 variants) for enhanced visual depth. Y-sorted rendering for proper depth layering. Delve exclusion zones prevent decorations from blocking entrances.
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
- **Merchant System**: Shop in Roboka selling base items, with real-time balance tracking. Wandering Merchant encounters sell 3 enhanced items (+1/+2) at premium pricing: (base + cumulative forge costs) * 1.5.
- **Item Durability System**: Weapons and armor have durability that decays with use. Items become unusable at 0 durability and can be repaired at the blacksmith. Durability is color-coded.
- **Forging & Enhancement System**: Blacksmith offers +1 to +9 weapon/armor enhancements with varying success rates, costs, and failure penalties (downgrade or destruction). Enhancements provide damage, durability, evasion, or damage reduction bonuses. Currency validation prevents negative balances - funds checked before forging and deducted immediately after attempt.
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