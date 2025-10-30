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
- **State Management**: LocalStorage (temporary, with plans for cloud migration)
- **Core Gameplay Loop**: Main Menu -> Town (Roboka) -> Explore Map -> Delve (3-5 Rooms) -> Combat -> Back to Town.
- **D20 Combat System**: Turn-based combat featuring d20 attack rolls against evasion, critical hits (natural 20 = brutal critical), weapon damage dice (1d4 to 2d6), and damage reduction from armor. Stamina is a key resource, with exhaustion leading to combat defeat. Combat transitions feature a 2-second fade-out "Combat Begins!" banner.
- **Combat UI**: Pokemon-style layout with enemy positioned at top right with info panel, player at bottom left with info panel, combat log in bottom left area, and action menu in bottom right corner. Menu includes Attack, Inventory (for mid-combat potion usage), and Run (50% success chance) options. Using a potion or running consumes the player's turn.
- **Stamina Management**: Drains per tile moved (0.3333 per tile) and per attack (5 per attack). Short rests restore 50% health/stamina but carry a 30% wilderness encounter risk.
- **Delve Generation**: Procedurally generated 3-5 room dungeons with varied room types (Combat, Boss, Treasure, Puzzle, Trap) and tier-based difficulty. Players can abandon delves and return to their entrance location.
- **Economy**: Uses Arcane Ash (AA) for common transactions and Crystalline Animus (CA) for rare items and enchantments.
- **Inventory & Equipment**: Features an 8-slot equipment system (Main Hand, Off Hand, Helmet, Chest, Legs, Boots, Shoulders, Cape) with two-handed weapon mechanics, light/heavy armor, and shields. A 15-slot active inventory bag and an 80-slot footlocker are available.
- **Loot System**: Enemies drop tier-based items, including weapons, armor, and potions.
- **Random Encounters**: Reduced frequency system (2.5% chance every 50 steps) with six encounter types: Combat (40%), Treasure (20%), Shrine to Faceless Old God (15%), Void Corruption Pocket (10%), Trapped Chest (10%), and Wandering Merchant (5%). Combat encounters display a 2-second announcement before automatically transitioning to battle.
- **Buff System**: Time-based temporary effects tracked via BuffManager. Buffs include Enraged Spirit (+5 melee damage, 1 hour), Cat'riena's Blessing (+1d4 to attack rolls, 1 hour), and Aroma of the Void (2x wilderness encounter rate until town return). All town-returning buffs clear automatically when entering Roboka.
- **Expanded Wilderness**: 3000x3000 world with camera-follow system (0.1 lerp) that smoothly tracks player movement. Eight procedurally placed delve entrances scattered across the map. Town portal marker provides instant return to Roboka (50px proximity trigger).
- **UI System**: All overlays use viewport-locking (setScrollFactor(0)) and interactive blocking to freeze gameplay. Menu system in wilderness (Short Rest, Inventory, Equipment, Return to Menu) and delves (Inventory, Abandon Delve, Return to Menu). Potion usage available in wilderness, between delve stages, and during combat.
- **Overlay Mechanics**: Uses isOverlayActive flag to disable player movement when menus/overlays are open, while keeping overlay buttons interactive. All UI elements tracked in arrays for proper cleanup.
- **ESC Key Navigation**: Hierarchical menu navigation using ESC key. From submenus (Inventory, Equipment) → ESC returns to main menu. From main menu → ESC closes menu. From gameplay → ESC opens quit confirmation menu.
- **Save/Load System**: Implemented using LocalStorage.
- **Modular Architecture**: Designed with separated concerns (scenes, systems, config, types, utils) using TypeScript and singleton patterns for managers (GameState, Scene) for extensibility.
- **HMR Configuration**: Vite dev server configured for Hot Module Replacement in Replit using WSS and `REPLIT_DEV_DOMAIN`.

### Feature Specifications
- **Town (Roboka)**: Player hub with interactive NPCs (Blacksmith, Merchant, Innkeeper, Quest Giver, Gem Expert, Marketplace).
- **Death/Respawn**: Upon defeat, the player's soul returns to Roboka.
- **Item Database**: Comprehensive database including weapons, armor, potions, and materials.
- **Potion Mechanics**: Restore health/stamina (8d4+15, averaging ~35 HP/Stamina per use).
- **Merchant System**: Comprehensive shop in Roboka featuring all base-level items (weapons 50-275 AA, armor 30-125 AA, potions 25 AA). Real-time AA/CA balance tracking with purchase validation. Wandering Merchant encounters offer rare 5% discount mobile shops in wilderness.

## External Dependencies

- **Game Engine**: Phaser 3.90.0
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **Temporary State/Save Storage**: LocalStorage

### Future Integrations
- **Blockchain**: Ronin Network (EVM-compatible Layer 1)
- **Wallet**: Ronin Wallet
- **NFTs**: Voidtouched Gems
- **Backend**: Cloud saves, multiplayer hub
- **Hosting**: TBD (Chainstack/Liquify for Ronin RPC)