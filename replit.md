# Gemforge Chronicles - Phase One: The Hunt

## Overview
Gemforge Chronicles is an ambitious web3 RPG game inspired by classic turn-based games like Pokemon, Final Fantasy, and Heroes of Might and Magic, with tabletop RPG mechanics and a rich economy system. This project is built on Phaser 3 with TypeScript for the game engine, designed to eventually integrate with blockchain (Ronin network) for NFT support.

## Current Status: Phase 1 Complete + Enhanced Systems ✓

### Phase 1 Milestone - Core Gameplay Loop (COMPLETE)
The foundational architecture and gameplay loop is fully implemented:
- ✅ Town (Roboka) - Player hub with stats and economy tracking
- ✅ Exploration - Procedurally placed delves to discover
- ✅ Delves - Procedurally generated 3-5 room dungeons
- ✅ Turn-based combat - Pokemon-style battle system
- ✅ Economy tracking - Arcane Ash (AA) and Crystalline Animus (CA)
- ✅ Save/Load system - LocalStorage (ready for cloud migration)
- ✅ Death/Respawn mechanic - Soul returns to Roboka

### Enhanced Systems (NEW)
- ✅ **Stamina System**: Drains during combat (10 per attack) and exploration (1 per 2s)
- ✅ **Short Rest**: Restore 50% health/stamina, 30% wilderness encounter chance
- ✅ **Abandon Delve**: Exit dungeons safely, return to delve location on map
- ✅ **Random Encounters**: Pokemon-style encounters (combat, treasure, events) while exploring
- ✅ **Wild Combat**: Separate encounter system for wilderness battles

## Project Structure

```
src/
├── scenes/           # Phaser scenes for each game state
│   ├── TownScene.ts        # Roboka - City of Steel (player hub)
│   ├── ExploreScene.ts     # Wilderness exploration
│   ├── DelveScene.ts       # Dungeon navigation
│   └── CombatScene.ts      # Turn-based battles
├── systems/          # Core game systems
│   ├── GameStateManager.ts    # Player data & economy (singleton)
│   ├── SceneManager.ts         # Scene transitions
│   ├── DelveGenerator.ts       # Procedural dungeon generation
│   └── CombatSystem.ts         # Turn-based combat logic
├── types/            # TypeScript interfaces
│   └── GameTypes.ts           # All game data types
├── config/           # Game configuration
│   └── GameConfig.ts          # Balance constants
├── entities/         # Game entities (future)
├── ui/              # UI components (future)
└── main.ts          # Entry point
```

## Tech Stack

### Current (Phase 1)
- **Game Engine**: Phaser 3.90.0 (Canvas/WebGL)
- **Language**: TypeScript 5.4
- **Build Tool**: Vite 5.0
- **State Management**: LocalStorage (temporary)
- **Port**: 5000 (development)

### Future Integration
- **Blockchain**: Ronin Network (EVM-compatible Layer 1)
- **Wallet**: Ronin Wallet integration
- **NFTs**: Voidtouched Gems (999 total supply)
- **Backend**: Cloud saves, multiplayer hub
- **Hosting**: TBD (Chainstack/Liquify for Ronin RPC)

## Gameplay Loop

```
Town (Roboka) 
  ↓ Venture into Wilds
Explore Map
  ↓ Discover Delve
Delve (3-5 Rooms)
  ↓ Enter Combat/Puzzle/Trap
Combat (Turn-based)
  ↓ Victory → Rewards | Defeat → Soul Returns
Back to Town
```

## Game Systems

### Economy
- **Arcane Ash (AA)**: Common currency for repairs, soulbinding, consumables
- **Crystalline Animus (CA)**: Rare currency for advanced crafting, enchantments
- Starting values: 500 AA, 10 CA
- Rewards scale with Delve tier

### Delve Generation
- Procedural 3-5 room dungeons
- Room types: Combat, Boss, Treasure, Puzzle, Trap
- Linear progression (no branching yet)
- Tier-based difficulty scaling (1-5)
- **Abandon Mechanic**: Exit button returns player to delve entrance location
- **Risk/Reward**: Must walk back to town, facing potential wilderness encounters

### Combat System
- Turn-based: Player → Enemies → Repeat
- Click enemies to attack
- Damage formula: (Attack - Defense * 0.5) * variance(0.8-1.2)
- **Stamina Cost**: 10 stamina per attack (configurable)
- **Low Stamina**: Cannot attack if insufficient stamina
- Victory awards AA/CA, Defeat respawns player
- Health/stamina persist between battles

### Stamina Management
- **Exploration Drain**: 1 stamina per 2 seconds (configurable)
- **Combat Drain**: 10 stamina per attack
- **Movement Lock**: Cannot move when stamina reaches 0
- **Recovery**: Short rest restores 50% of max stamina
- **Strategic Resource**: Must manage stamina between combat and exploration

### Rest System
- **Short Rest**: Available anytime (button in explore scene)
- **Duration**: 3 seconds
- **Recovery**: Restores 50% health and stamina
- **Wilderness Risk**: 30% chance of ambush encounter while resting in wilds
- **Safe Zones**: Future - no encounter risk in town/safe areas

### Random Encounters (Wilderness)
- **Trigger**: Random chance after 30 movement steps
- **Encounter Types**:
  - **Combat (50%)**: Fight 1-2 wild Void Spawns
  - **Treasure (25%)**: Find 10-40 AA and 0-2 CA
  - **Events (25%)**: Flavor text, world-building moments
- **Cooldown**: Prevents rapid consecutive encounters
- **Wild Combat**: Returns to explore scene after battle (not delve)

### Progression
- Player level, health, stamina tracking
- Inventory system (foundation ready)
- Equipment slots (weapon, armor, accessory)
- Soulbinding mechanic (planned)

## Whitepaper Implementation Status

### Implemented ✓
- Core gameplay loop (Hunt phase)
- Delve system with procedural generation
- Turn-based combat with stamina system
- AA/CA economy tracking
- Death/respawn mechanic
- Save/load system
- **Stamina management** (combat and exploration drain)
- **Short rest mechanic** with wilderness encounter risk
- **Abandon delve** mechanic with location return
- **Random encounters** (combat, treasure, events)
- **Wild combat** separate from delve combat

### In Progress
- Visual assets (currently using placeholder rectangles)
- Sound effects and music
- Inventory UI
- Equipment system effects

### Planned (Future Phases)
- **Spirit Towers**: Fast travel between biomes
- **Karma System**: Morality tracking for returning lost items
- **Multiplayer Hub**: Roboka social area (chat, show gear, marketplace)
- **Crafting/Forging**: +1 to +9 upgrade system with failure mechanics
- **Shiny System**: Rare variants with special properties
- **Blockchain Integration**: NFT gems, wallet connection, on-chain marketplace
- **Cloud Saves**: Migration from localStorage to backend

## Art Direction & Vision

### Current Placeholder Style
- Simple colored rectangles for entities
- Basic UI with text and buttons
- Dark fantasy color palette (purples, reds, blacks)

### Target Style (Future)
- Pixel art assets
- Tabletop RPG aesthetic (dice rolling, grid-based)
- Dark fantasy atmosphere (Void corruption theme)
- Heroes of Might and Magic visual inspiration
- Final Fantasy combat presentation

## Development Roadmap

### Phase 1: Foundation (COMPLETE) ✓
- [x] Project architecture
- [x] Scene management system
- [x] Gameplay loop (Town → Explore → Delve → Combat)
- [x] Economy tracking
- [x] Save system

### Phase 2: Content & Polish (Next)
- [ ] Asset creation pipeline (with user-provided art)
- [ ] Character sprites with walk cycles
- [ ] Enemy variety and bestiary
- [ ] Attack animations
- [ ] UI/UX improvements
- [ ] Sound design

### Phase 3: Advanced Systems
- [x] Stamina and short rest mechanics
- [x] Random encounters
- [ ] Inventory and equipment UI
- [ ] Crafting and forging
- [ ] Spirit Towers

### Phase 4: Multiplayer
- [ ] Roboka multiplayer hub
- [ ] Real-time chat
- [ ] Player channels (100 per instance)
- [ ] Marketplace UI

### Phase 5: Web3 Integration
- [ ] Ronin wallet connection
- [ ] NFT minting (Voidtouched Gems)
- [ ] On-chain marketplace (WETH/RON trading)
- [ ] Cloud save backend

### Phase 6: Launch & Beyond
- [ ] Beta testing
- [ ] Performance optimization
- [ ] Mobile support (future consideration)
- [ ] Continuous content updates

## Development Notes

### HMR Configuration
The Vite dev server is configured with WSS protocol and `REPLIT_DEV_DOMAIN` for proper hot module replacement in the Replit environment. This prevents random game restarts during development.

### Code Quality
- TypeScript strict mode enabled
- Modular architecture for easy expansion
- Singleton patterns for managers (GameState, Scene)
- Proper separation of concerns (scenes, systems, config)
- No circular dependencies

### Testing Strategy
- Manual testing of gameplay loop
- Architect review for code quality
- Save/load verification
- Combat persistence validation

## Known Issues & Limitations

### Current
- Assets are placeholder rectangles (awaiting art)
- Inventory not displayed in UI
- Equipment doesn't affect combat stats
- Limited enemy variety
- No sound/music

### Technical Debt
- Consider adding unit tests for combat system
- May need optimization for large delve counts
- LocalStorage has size limits (need cloud migration)

## Collaboration Workflow

This is a long-term solo project built collaboratively with an AI assistant. The approach:
1. User provides design vision and whitepaper
2. Work in iterative milestones
3. Use placeholder assets initially
4. User will provide final art assets
5. Focus on strong architecture to support future features

## Recent Changes
- **October 27, 2025** (PM): Enhanced Systems Implementation
  - ✅ Implemented full stamina system (combat: 10/attack, exploration: 1/2s)
  - ✅ Added short rest mechanic with 50% health/stamina recovery
  - ✅ Added wilderness encounter chance (30%) during rest
  - ✅ Implemented abandon delve with location tracking
  - ✅ Built random encounter system (combat, treasure, events)
  - ✅ Created wild combat separate from delve combat
  - ✅ Fixed multiple enemy combat click bug
  - ✅ All features reviewed and approved by architect

- **October 27, 2025** (AM): Phase 1 Foundation Complete
  - Built complete gameplay loop (Town → Explore → Delve → Combat)
  - Implemented GameStateManager with AA/CA economy
  - Created DelveGenerator for procedural dungeons (3-5 rooms)
  - Built turn-based CombatSystem
  - Fixed critical bug: combat results now persist to player state
  - Passed architect review for architecture quality

## Next Steps

1. **Immediate**: Phase 2 - Asset Integration
   - Discuss art asset requirements with user
   - Create walk cycle sprite specifications
   - Define attack animation needs
   - Plan enemy sprite designs
   - Design UI mockups for inventory/stats

2. **Short-term**: Advanced Features
   - Implement inventory UI and management
   - Connect equipment to combat stats (modifiers)
   - Add more enemy types and variety
   - Add consumable items (health/stamina potions)
   - Implement encounter variety (more event types)

3. **Medium-term**: Prepare for Web3
   - Research Ronin integration options
   - Plan backend architecture for cloud saves
   - Design NFT smart contracts
   - Build marketplace foundation
