# Gemforge Chronicles

## Overview
Gemforge Chronicles is an ambitious web3 RPG game inspired by classic turn-based titles like Pokemon, Final Fantasy, and Heroes of Might and Magic. It integrates tabletop RPG mechanics, a rich economy, and blockchain (Ronin network) for NFT support. Built on Phaser 3 with TypeScript, the game features a core loop of town interaction, wilderness exploration, procedurally generated delves, and D20-style turn-based combat. The project aims to deliver a deep, engaging RPG experience with a strong emphasis on strategic combat, economic simulation, and a dark fantasy aesthetic.

## User Preferences
This is a long-term solo project built collaboratively with an AI assistant. The approach:
1. User provides design vision and whitepaper
2. Work in iterative milestones
3. Use placeholder assets initially
4. User will provide final art assets
5. Focus on strong architecture to support future features

## System Architecture

### UI/UX Decisions
- **Visuals**: Pixel art for environments (city, wilderness, delve entrances, trees, bushes, grass), item sprites, player combat sprite, and enemy sprites (Void Spawn, Greater Void Spawn, Shadow Beast). NPCs are currently colored rectangles (120x120), except Blacksmith, Merchant, Gem Expert, and Garthek the Stitcher which have custom circular shop button sprites (120x120) with character portraits. NPC grid uses 145px row spacing and 120px horizontal spacing for clean, uncluttered layout. Enemy sprites use 0.2 scale with tint effects for hover states.
- **Combat UI Layout**: Four-area design with streamlined attack selection. Pink area (top-left 320x140px): HP/SP bars using PixelArtBar component (same as town/wilderness) with hover tooltips positioned 20px right of cursor. Green area (top-center/right): wide combat log (width-630px, 14px font) for detailed battle messages. Orange box (bottom, width-290 x 170px): direct weapon attack buttons in fixed 2x2 grid layout (4 visible attacks max), no modal selection. Pagination controls (Prev/Next + page indicator) appear when player has >4 attacks. Sidebar (right, 270x160px): Inventory, Run, End Turn only. Attack buttons show name (14px), stamina cost (11px), action cost (11px) with color-coding for availability (green=available, red=insufficient stamina, gray=insufficient actions). Special effects shown via dynamic hover tooltips that resize based on text content (word wrap at 350px, max 400px width) and follow cursor 20px to the right with viewport clamping. Zero-attack edge case displays "No weapons equipped" message. Pagination index auto-clamps when attack count changes (weapon breaks, swaps, new combat) to prevent empty grids.
- **Combat Backgrounds**: Two distinct pixel art backgrounds that automatically adapt based on encounter type. Delve combat uses an atmospheric void cavern with purple-tinted corrupted caves and glowing cyan crystals. Wilderness combat uses a vibrant forest clearing with trees, grass, and rocks. Both scale automatically to cover the full combat screen. Positioning differs by location: in delves, player on lower left platform (x=260, y=height-280) and enemies centered at fixed position (x=740, y=200); in wilderness, player on left side of dirt path (x=380, y=height-360) and enemies centered at fixed position (x=820, y=height-420). Multiple enemies distribute with 120px spacing centered around these fixed points.
- **Combat Animations**: Player sprite has a lunge animation for attacks and a red hit flash when taking damage.
- **Typography**: Press Start 2P pixel font for all UI text and menus (improved readability over VT323). Font sizes: xsmall (14px), small (20px), medium (25px), large (35px), xlarge (45px). Main title uses large (35px), subtitle uses small (20px) for balanced hierarchy. Stat text (level, evasion, DR) uses xsmall (14px) for cleaner UI. All text uses `resolution: 2` for crisp pixel-perfect rendering.
- **Currency Icons**: Pixel art coin sprites for Arcane Ash (AA) and Crystalline Animus (CA).
- **Equipment Panel**: Custom pixel art 3x4 grid panel with interactive slots, displaying equipped items with scaling and click-to-equip functionality.
- **Item Enhancement Visuals**: Color-coded item names based on enhancement level (white, green, blue, purple, red, golden yellow for shiny). Equipped items show "[E]" in forge UI.
- **Enemy Sprite System**: Tier 1-2 enemies now display pixel art sprites. Void Spawn (T1) shows a purple void creature with glowing eye. Skitterthid (T1) displays a dark blue insectoid with purple markings and glowing purple eyes. Hollow Husk (T1) appears as a gaunt humanoid figure. Aetherbear (T1 boss) displays a majestic bear with ethereal qualities. Greater Void Spawn (T1 boss) displays a larger tentacled void horror. Shadow Beast (T2) shows a dark shadowy creature with glowing magenta eyes. Boss enemies display 20% larger (0.24 scale) than regular enemies (0.2 scale) for visual distinction. System includes sprite mapping with fallback to colored rectangles for enemies without sprites.
- **Stats Panel**: Unified StatsPanel component (src/ui/StatsPanel.ts) displays player vitals in both Town and Wilderness scenes. Clean vertical layout with icon-based positioning: HP/SP bars (360px wide, 36px tall, no labels) with hover tooltips (scrollFactor 0) showing numeric values positioned 20px right of cursor, vertically stacked currency (AA above CA) with 0.06 scale icons and 14px text, evasion icon + text (14px), DR icon + text (14px) directly underneath evasion, level text (14px) below DR. All elements maintain exactly 22px gaps between icon bottoms using dynamic spacing based on each icon's displayHeight. All stat text uses consistent 14px (xsmall) font at textX=65 for unified alignment. Panel is viewport-locked with scroll factor 0. Icons are user-provided pixel art.
- **Town Menu Design System**: All town menus (Blacksmith's Forge, Merchant's Shop, Innkeeper, Vault Keeper, Garthek the Stitcher) follow a unified design pattern with consistent spacing and typography. Three-row header layout: Row 1 (Title) at headerBaseY, Row 2 (Currencies/Description) at headerBaseY + 65px, Row 3 (Action tabs/Instructions) at headerBaseY + 130px. All text uses xsmall (14px) for complete visual consistency across menus and sidebar. 65px vertical gaps between header rows, 220px horizontal tab spacing (adapts to 110px for 2-button layouts), 40px gap between tabs and content. Currency icons use 57px spacing to numbers matching sidebar.
  - **Blacksmith's Forge**: 900px wide panel. Tabs: [Enhance], [Repair All], [Repair]. Column layout: item names (width/2 - 420), enhancement/durability values (width/2), [Select] buttons (width/2 + 150). Item lists use 28px row height with fixed 3-column grids.
  - **Merchant's Shop**: 750px wide panel with scrollable item list. Tabs: [Weapons], [Armor], [Potions]. Column layout: item names (width/2 - 340), prices (width/2 + 80), [Buy] buttons (width/2 + 200). Scroll viewport: 280px tall with geometry mask clipping. Mouse wheel scrolling with visual scrollbar indicator (8px wide track/thumb, only shown when content exceeds viewport). Pointer-based click gating ensures only visible items are interactive.
  - **Innkeeper**: Single-action menu with currency display and [Rest and Restore] button.
  - **Vault Keeper**: Two-tab layout ([Deposit], [Withdraw]) with item grids showing inventory/footlocker contents.
  - **Garthek the Stitcher**: 750px wide panel with soulbinding interface. Quote at header row 2, instructions at row 3, checkbox grid below for 8 equipment slots (max 3 bindings).
- **Target Style**: Future target is full pixel art assets, tabletop RPG aesthetic (dice rolling, grid-based), dark fantasy atmosphere with a Void corruption theme, inspired by Heroes of Might and Magic and Final Fantasy.

### Technical Implementations
- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect) with session-based auth. Multi-instance detection prevents save conflicts.
- **State Management**: Server-side PostgreSQL saves with 30-second auto-save, LocalStorage fallback.
- **Enemy System**: Metadata-driven enemy database in EnemyFactory.ts. 15 enemy types with `tier` and `isBoss` fields for future-proof design. Tier 1 has 5 mobs (Void Spawn, Skitterthid, Hollow Husk, Wailing Wisp, Crawley Crow) and 2 bosses (Greater Void Spawn, Aetherbear); Tiers 2-5 have 2 each (mob and boss). Currency rewards use per-enemy metadata: T1 mobs (15-45 AA), T1 bosses (25-80 AA), T2-T5 (30 × tier per enemy). T1 boss loot uses category-based system with exact probabilities: potions 15%, base gear 5%, +1 enhanced gear 3%, +2 enhanced gear 1%, +3 enhanced gear 0.5%. Each category rolls once; if successful, randomly selects one item from that category.
- **Core Gameplay Loop**: Main Menu -> Town (Roboka) -> Explore Map -> Delve (3-5 Rooms) -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based tactical combat with d20 rolls, critical hits, armor reduction, and a 2-action economy. Features Pokemon-style attack selection UI. Weapon types have unique attacks with varying stamina/action costs and damage multipliers. Includes status conditions (stunned, poisoned, bleeding, dependable, weakened, empowered, slowed), multi-hit combos, AoE cleaves, backstabs, vampiric healing, and instant-kill finishers. Combat ends immediately upon enemy defeat.
  - **Weakened**: Target deals 10% less damage and has -2 to hit.
  - **Empowered**: Target deals 25% more damage.
- **Enemy Special Attacks**: T1 enemies have unique special abilities with specific probabilities:
  - **Void Spawn**: Splooge (35%) - slows player
  - **Skitterthid**: Poison Barb (35%) - +2 hit, 1d8+2 damage, 1d4 poison stacks
  - **Hollow Husk**: Agonizing Bite (30%) - -1 hit, 1d10 damage, weakened for 1d3 rounds
  - **Wailing Wisp**: Shrill Touch (40%) - +2 hit, 2d4+2 damage, 1d2 poison stacks
  - **Crawley Crow**: Shiny Shiny (50%) - +1 hit, steals random inventory item, attempts flee (d20 vs 12+player level), combat ends if flee succeeds
  - **Greater Void Spawn**: Chronostep (70% when below 40% HP) - time manipulation ability
  - **Aetherbear**: Mighty Roar (25%) - gains empowered for 1d4+2 rounds; Crushing Slam (30%) - +3 hit, 3d8+4 damage, 15% stun on hit, 25% self-stun on miss
- **Stamina Management**: Stamina drains per tile moved and per attack. Short rests restore health/stamina with encounter risk.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with tier-based difficulty and hidden room types ('???'). Includes interactive trap rooms with D20 disarm checks and dramatic choices.
- **Economy**: Arcane Ash (AA) for common transactions, Crystalline Animus (CA) for rare items.
- **Inventory & Equipment**: 8-slot equipment, 15-slot active inventory, 80-slot footlocker. Supports dual-wielding. Items have durability that decays and can be repaired. Soulbinding allows binding up to 3 equipment slots.
- **Loot System**: Enemies drop tier-based items with enhancement metadata. All loot items include `enhancementLevel` (defaults to 0 for standard drops). Items are cloned before returning to prevent reference mutation. Victory screen searches by both itemId and enhancementLevel for accurate display. Tombstone encounters (5% chance) allow looting items from other players.
- **Random Encounters**: Varied types (Combat, Treasure, Shrine, Corrupted Void Portal (2-stage mini-delve), Trapped Chest, Tombstone, Wandering Merchant). Combat encounters have a 15% chance to spawn an Aetherbear boss instead of standard enemies.
- **Buff System**: Time-based temporary effects managed by BuffManager.
- **Wilderness Exploration**: 3000x3000 world with camera-follow, procedural terrain (grass, dirt, trees, bushes, grass tufts), Y-sorted rendering, and fog of war. Limited rests per wilderness trip.
- **UI System**: Viewport-locked, interactive, blocking overlays with hierarchical ESC key navigation.
- **Menu System**: Dual-menu architecture separating concerns: ESC menu for system functions (Interface settings, Exit Game), M key for character functions (Equipment, Inventory, Short Rest). Interface menu has tabbed design with Music controls and Controls reference.
- **Audio System**: 5-track music system with smart transitions and combat memory. Tracks: intro (main menu), town, wilderness, delve, combat. AudioManager handles crossfades, volume control, mute toggle, and saves/restores previous track when combat ends. Gracefully handles missing audio files.
- **Modular Architecture**: Separated concerns using TypeScript and singleton patterns.
- **Services**: Innkeeper for health/stamina rest, Vault Keeper for footlocker access, Blacksmith for forging and enhancement.
- **Forging & Enhancement System**: Allows +1 to +9 enhancements with success rates, costs, and failure penalties (downgrade/destruction). Features a "Shiny System" for rare, prestige variant items immune to destruction.
- **Karma System**: Rewards players for returning looted tombstone items via Halls of Virtue.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Backend Framework**: Express.js 5.1
- **Database**: PostgreSQL via @neondatabase/serverless
- **ORM**: Drizzle ORM 0.44.7
- **Authentication**: openid-client 6.8.1 (Replit Auth)
- **Session Store**: connect-pg-simple 10.0.0