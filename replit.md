# Gemforge Chronicles - Phase One: The Hunt

## Overview
Gemforge Chronicles is an ambitious web3 RPG game inspired by classic turn-based games like Pokemon, Final Fantasy, and Heroes of Might and Magic, with tabletop RPG mechanics and a rich economy system. This project is built on Phaser 3 with TypeScript for the game engine, designed to eventually integrate with blockchain (Ronin network) for NFT support.

## Current Status: Foundation Complete ✓

### Phase 1 Milestone - Core Gameplay Loop (COMPLETE)
The foundational architecture and gameplay loop is fully implemented:
- ✅ Town (Roboka) - Player hub with stats and economy tracking
- ✅ Exploration - Procedurally placed delves to discover
- ✅ Delves - Procedurally generated 3-5 room dungeons
- ✅ Turn-based combat - Pokemon-style battle system
- ✅ Economy tracking - Arcane Ash (AA) and Crystalline Animus (CA)
- ✅ Save/Load system - LocalStorage (ready for cloud migration)
- ✅ Death/Respawn mechanic - Soul returns to Roboka

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

### Combat System
- Turn-based: Player → Enemies → Repeat
- Click enemies to attack
- Damage formula: (Attack - Defense * 0.5) * variance(0.8-1.2)
- Victory awards AA/CA, Defeat respawns player
- Health/stamina persist between battles

### Progression
- Player level, health, stamina tracking
- Inventory system (foundation ready)
- Equipment slots (weapon, armor, accessory)
- Soulbinding mechanic (planned)

## Whitepaper Implementation Status

### Implemented ✓
- Core gameplay loop (Hunt phase)
- Delve system with procedural generation
- Turn-based combat
- AA/CA economy tracking
- Death/respawn mechanic
- Save/load system

### In Progress
- Visual assets (currently using placeholder rectangles)
- Sound effects and music
- Stamina consumption mechanics
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
- **Random Encounters**: Pokemon-style encounters while exploring

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
- [ ] Stamina and short rest mechanics
- [ ] Inventory and equipment UI
- [ ] Crafting and forging
- [ ] Spirit Towers
- [ ] Random encounters

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
- No stamina consumption yet
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
- **October 27, 2025**: Phase 1 Foundation Complete
  - Built complete gameplay loop (Town → Explore → Delve → Combat)
  - Implemented GameStateManager with AA/CA economy
  - Created DelveGenerator for procedural dungeons (3-5 rooms)
  - Built turn-based CombatSystem
  - Fixed critical bug: combat results now persist to player state
  - Passed architect review for architecture quality

## Next Steps

1. **Immediate**: Begin Phase 2 - Asset Integration
   - Discuss art asset requirements with user
   - Create walk cycle sprite specifications
   - Define attack animation needs
   - Plan enemy sprite designs

2. **Short-term**: Enhance Core Systems
   - Add stamina mechanics
   - Implement inventory UI
   - Connect equipment to combat stats
   - Add more enemy types

3. **Medium-term**: Prepare for Web3
   - Research Ronin integration options
   - Plan backend architecture for cloud saves
   - Design NFT smart contracts
   - Build marketplace foundation
