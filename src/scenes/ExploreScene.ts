import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { DelveGenerator } from '../systems/DelveGenerator';
import { EnemyFactory } from '../systems/EnemyFactory';
import { EquipmentManager } from '../systems/EquipmentManager';
import { GameConfig } from '../config/GameConfig';
import { ItemDatabase } from '../config/ItemDatabase';
import { ShopData } from '../config/ShopData';
import { BuffManager } from '../systems/BuffManager';
import { DiceRoller } from '../utils/DiceRoller';
import { PlayerEquipment } from '../types/GameTypes';
import { ForgingSystem } from '../systems/ForgingSystem';
import { TerrainGenerator } from '../utils/TerrainGenerator';
import { DurabilityManager } from '../systems/DurabilityManager';
import { CurrencyDisplay } from '../utils/CurrencyDisplay';
import { FONTS } from '../config/fonts';
import { ApiClient } from '../utils/ApiClient';
import { AudioManager } from '../managers/AudioManager';
import { StatsPanel } from '../ui/StatsPanel';

export class ExploreScene extends Phaser.Scene {
  // Helper functions for item enhancement display
  private static getEnhancementColor(enhancement: number, isShiny: boolean): string {
    if (isShiny) return '#ffd700'; // Golden
    if (enhancement >= 9) return '#ff0000'; // Red
    if (enhancement >= 7) return '#aa00ff'; // Purple
    if (enhancement >= 4) return '#0088ff'; // Blue
    if (enhancement >= 1) return '#00ff00'; // Green
    return '#ffffff'; // White
  }

  private static getEnhancedItemName(baseName: string, enhancement: number, isShiny: boolean): string {
    const prefix = isShiny ? '★ ' : '';
    const suffix = enhancement > 0 ? ` +${enhancement}` : '';
    return `${prefix}${baseName}${suffix}`;
  }

  private gameState!: GameStateManager;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private delveMarkers: Phaser.GameObjects.Container[] = [];
  private tombstoneMarkers: Map<number, Phaser.GameObjects.Container> = new Map();
  private townPortal!: Phaser.GameObjects.Container;
  private fungalHollowsPortal: Phaser.GameObjects.Container | null = null;
  private statsPanel!: StatsPanel;
  private movementStepCounter: number = 0;
  private encounterCooldown: boolean = false;
  private staminaDebt: number = 0;
  private isOverlayActive: boolean = false;
  private readonly TILE_SIZE: number = 32;
  private readonly WORLD_SIZE: number = 6000;
  private readonly CHUNK_SIZE: number = 800;
  private menuState: 'none' | 'main' | 'inventory' | 'equipment' | 'quit' | 'encounter' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;
  private terrainContainer!: Phaser.GameObjects.Container;
  
  // Throttled movement save system - saves every 5 seconds while player is moving
  private lastMovementSaveTime: number = 0;
  private readonly MOVEMENT_SAVE_INTERVAL: number = 5000; // 5 seconds
  private isPlayerMoving: boolean = false;
  private treeSprites: Phaser.GameObjects.Sprite[] = [];
  private decorationSprites: Phaser.GameObjects.Sprite[] = [];
  private fogOfWarGraphics!: Phaser.GameObjects.Graphics;
  private unexploredGraphics!: Phaser.GameObjects.Graphics;
  private readonly VISIBILITY_RADIUS: number = 256;

  constructor() {
    super('ExploreScene');
  }

  preload() {
    this.load.image('tree1', '/assets/terrain/tree1.png');
    this.load.image('tree2', '/assets/terrain/tree2.png');
    this.load.image('tree3', '/assets/terrain/tree3.png');
    this.load.image('bush', '/assets/terrain/bush.png');
    this.load.image('grass1', '/assets/terrain/grass1.png');
    this.load.image('grass2', '/assets/terrain/grass2.png');
    this.load.image('grass3', '/assets/terrain/grass3.png');
    this.load.image('grass4', '/assets/terrain/grass4.png');
    this.load.image('delve-entrance', '/assets/terrain/delve-entrance.png');
    this.load.image('roboka-city', '/assets/terrain/roboka-city.png');
    this.load.image('tombstone', '/assets/tombstone.png');
    this.load.image('gemforge-logo', '/assets/ui/gemforge-logo.png');
    this.load.image('coin-aa', '/assets/ui/currency/arcane-ash-coin.png');
    this.load.image('coin-ca', '/assets/ui/currency/crystalline-animus-coin.png');
    this.load.image('foot-icon', '/assets/ui/foot-icon.png');
    this.load.image('shield-icon', '/assets/ui/shield-icon.png');
    this.load.audio('wilderness-music', '/assets/audio/wilderness-music.mp3');
  }

  init(data?: { returnToLocation?: { x: number; y: number } }) {
    if (data?.returnToLocation) {
      this.registry.set('returnToLocation', data.returnToLocation);
    }
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('explore');
    
    // Reset encounter state - ensures fresh encounters after death/respawn
    this.movementStepCounter = 0;
    this.encounterCooldown = false;
    this.isOverlayActive = false;
    this.menuState = 'none';
    this.currentMenuCloseFunction = null;

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, this.WORLD_SIZE, this.WORLD_SIZE, 0x000000).setOrigin(0);

    this.terrainContainer = this.add.container(0, 0);
    this.terrainContainer.setDepth(1);
    
    this.unexploredGraphics = this.add.graphics();
    this.unexploredGraphics.setDepth(12);
    
    this.fogOfWarGraphics = this.add.graphics();
    this.fogOfWarGraphics.setDepth(10);

    const logo = this.add.sprite(width / 2, 45, 'gemforge-logo');
    logo.setOrigin(0.5);
    logo.setScale(0.048);
    logo.setScrollFactor(0);
    logo.setDepth(100);

    const returnLocation = this.registry.get('returnToLocation') as { x: number; y: number } | undefined;
    const playerData = this.gameState.getPlayer();
    
    if (returnLocation) {
      this.player = this.add.rectangle(returnLocation.x, returnLocation.y, 32, 32, 0x4488ff);
      this.registry.remove('returnToLocation');
    } else {
      this.player = this.add.rectangle(this.WORLD_SIZE / 2, this.WORLD_SIZE / 2, 32, 32, 0x4488ff);
    }
    this.player.setDepth(5);

    this.cameras.main.setBounds(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.generateInitialWorld();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const mKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    
    this.escKey.on('down', () => {
      this.handleEscapeKey();
    });
    
    mKey.on('down', () => {
      if (!this.isOverlayActive) {
        this.openMenu();
      }
    });

    // Create stats panel
    this.statsPanel = new StatsPanel(this, 20, 40);
    this.statsPanel.setDepth(100);
    this.statsPanel.getContainer().setScrollFactor(0);
    this.statsPanel.update(playerData);

    this.add.text(20, height - 40, 'Arrow keys to move • Approach markers to interact • M to open menu', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#cccccc',
      resolution: 2,
    }).setScrollFactor(0).setDepth(100);

    // Play wilderness music
    const audioManager = AudioManager.getInstance();
    audioManager.switchMusic(this, 'wilderness-music', true);
  }

  private drainStaminaForMovement(pixelsMoved: number): void {
    const tilesMoved = pixelsMoved / this.TILE_SIZE;
    this.staminaDebt += tilesMoved * GameConfig.STAMINA.MOVEMENT_DRAIN_RATE;

    if (this.staminaDebt >= 1) {
      const staminaToDrain = Math.floor(this.staminaDebt);
      this.staminaDebt -= staminaToDrain;

      const player = this.gameState.getPlayer();
      player.stamina = Math.max(0, player.stamina - staminaToDrain);
      
      // Decay armor durability during movement (0.1 per tile moved)
      const durabilityMessages = DurabilityManager.decayArmorAfterMovement(player, tilesMoved);
      if (durabilityMessages.length > 0) {
        durabilityMessages.forEach(msg => this.showMessage(msg));
      }
      
      // Auto-unequip broken items
      const brokenMessages = DurabilityManager.unequipBrokenItems(player);
      if (brokenMessages.length > 0) {
        brokenMessages.forEach(msg => this.showMessage(msg));
        // Recalculate stats after unequipping broken items
        player.stats = EquipmentManager.calculatePlayerStats(player);
      }
      
      this.gameState.updatePlayer(player);
    }
  }

  update() {
    const playerData = this.gameState.getPlayer();
    const speed = 3;
    let pixelsMoved = 0;

    // Store player location for potential death/tombstone creation
    this.data.set('playerLocation', { x: this.player.x, y: this.player.y });
    
    // Update player position in GameState as last known overworld location
    if (playerData.position.x !== this.player.x || playerData.position.y !== this.player.y) {
      this.gameState.updatePlayer({ position: { x: this.player.x, y: this.player.y } });
    }

    const canMove = playerData.stamina > 0 && !this.isOverlayActive;

    if (canMove) {
      if (this.cursors.left.isDown) {
        this.player.x -= speed;
        pixelsMoved += speed;
      }
      if (this.cursors.right.isDown) {
        this.player.x += speed;
        pixelsMoved += speed;
      }
      if (this.cursors.up.isDown) {
        this.player.y -= speed;
        pixelsMoved += speed;
      }
      if (this.cursors.down.isDown) {
        this.player.y += speed;
        pixelsMoved += speed;
      }

      if (pixelsMoved > 0) {
        this.drainStaminaForMovement(pixelsMoved);
        
        this.movementStepCounter++;
        if (this.movementStepCounter > GameConfig.WORLD.ENCOUNTER_STEP_THRESHOLD && !this.encounterCooldown) {
          this.checkRandomEncounter();
        }
        this.checkDelveProximity();
        this.checkTombstoneProximity();
        this.checkTownPortalProximity();
        this.checkFungalHollowsPortalProximity();
        
        // Throttled movement save - prevents exploitation by closing game during exploration
        this.isPlayerMoving = true;
        const now = Date.now();
        if (now - this.lastMovementSaveTime > this.MOVEMENT_SAVE_INTERVAL) {
          this.lastMovementSaveTime = now;
          this.gameState.saveToServer();
        }
      } else {
        this.isPlayerMoving = false;
      }
    }

    this.markNearbyTilesExplored();
    this.updateFogOfWar();
    this.updateInfo();
  }

  private generateInitialWorld(): void {
    this.generateDelves();
    this.createTownPortal();
    this.loadTombstones();
    this.checkAndSpawnFungalHollowsPortal();
  }

  private generateDelves(): void {
    const state = this.gameState.getState();
    
    // If we have discovered delves, use those positions (persistent within session)
    if (state.discoveredDelves.length > 0) {
      // Load existing delves
      state.discoveredDelves.forEach(delve => {
        // Don't create markers for completed delves
        if (!this.gameState.isDelveCompleted(delve.x, delve.y)) {
          // Default to tier 1 if tier is undefined (legacy data fix)
          const tier = delve.tier ?? 1;
          const marker = this.createDelveMarker(delve.x, delve.y, tier);
          this.delveMarkers.push(marker);
        }
      });
      // Set delve positions for terrain generation (clear spaces around delves)
      TerrainGenerator.setDelvePositions(state.discoveredDelves);
      return;
    }

    // Generate new delves (only on first visit or after returning from town)
    const robokaX = this.WORLD_SIZE / 2;
    const robokaY = this.WORLD_SIZE / 2;
    const minDistanceFromTown = 200;
    const newDelves: { x: number; y: number; tier: number }[] = [];

    // Scale delve count with map size (roughly 8 per 3000x3000 area = 32 for 6000x6000)
    const numDelves = 24 + Math.floor(Math.random() * 8); // 24-31 delves
    for (let i = 0; i < numDelves; i++) {
      let x: number;
      let y: number;
      let attempts = 0;
      const maxAttempts = 100;

      // Keep trying until we find a spot far enough from Roboka
      do {
        x = 200 + Math.random() * (this.WORLD_SIZE - 400);
        y = 200 + Math.random() * (this.WORLD_SIZE - 400);
        attempts++;
      } while (
        Phaser.Math.Distance.Between(x, y, robokaX, robokaY) < minDistanceFromTown &&
        attempts < maxAttempts
      );

      const tier = 1; // Only Tier 1 delves in current area
      newDelves.push({ x, y, tier });

      const marker = this.createDelveMarker(x, y, tier);
      this.delveMarkers.push(marker);
    }

    // Store delves in game state for persistence
    state.discoveredDelves = newDelves;
    
    // Set delve positions for terrain generation (clear spaces around delves)
    TerrainGenerator.setDelvePositions(newDelves);
  }

  private createTownPortal(): void {
    const x = this.WORLD_SIZE / 2 + 150;
    const y = this.WORLD_SIZE / 2;

    const citySprite = this.add.sprite(0, 0, 'roboka-city');
    citySprite.setScale(0.25);
    citySprite.setOrigin(0.5, 0.65);
    
    const label = this.add.text(0, -140, 'Roboka', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc66',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.townPortal = this.add.container(x, y, [citySprite, label]);
    this.townPortal.setDepth(7);
  }

  private async checkAndSpawnFungalHollowsPortal(): Promise<void> {
    if (!this.gameState.hasUnlockedFungalHollows()) {
      return;
    }

    const state = this.gameState.getState();
    let portalPosition = state.player.fungalHollowsPortalPosition;

    if (!portalPosition) {
      portalPosition = this.generateEdgePortalPosition();
      state.player.fungalHollowsPortalPosition = portalPosition;
      
      try {
        await this.gameState.saveToServer();
        console.log('Fungal Hollows portal position saved:', portalPosition);
      } catch (error) {
        console.error('Failed to save Fungal Hollows portal position:', error);
      }
    }

    this.createFungalHollowsPortal(portalPosition.x, portalPosition.y);
  }

  private generateEdgePortalPosition(): { x: number; y: number } {
    const margin = 150;
    const edge = Math.floor(Math.random() * 4);

    let x: number, y: number;

    switch (edge) {
      case 0: // Top edge
        x = margin + Math.random() * (this.WORLD_SIZE - margin * 2);
        y = margin;
        break;
      case 1: // Right edge
        x = this.WORLD_SIZE - margin;
        y = margin + Math.random() * (this.WORLD_SIZE - margin * 2);
        break;
      case 2: // Bottom edge
        x = margin + Math.random() * (this.WORLD_SIZE - margin * 2);
        y = this.WORLD_SIZE - margin;
        break;
      case 3: // Left edge
      default:
        x = margin;
        y = margin + Math.random() * (this.WORLD_SIZE - margin * 2);
        break;
    }

    return { x, y };
  }

  private createFungalHollowsPortal(x: number, y: number): void {
    const portalGlow = this.add.circle(0, 0, 50, 0x44aa44, 0.3);
    const portalCore = this.add.circle(0, 0, 35, 0x228822, 0.6);
    const portalInner = this.add.circle(0, 0, 20, 0x116611, 0.8);

    const label = this.add.text(0, -80, 'Fungal Hollows', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#66ff66',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const tierLabel = this.add.text(0, -60, 'Tier 2 Zone', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#44cc44',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: portalGlow,
      scale: 1.3,
      alpha: 0.15,
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });

    this.tweens.add({
      targets: portalCore,
      rotation: Math.PI * 2,
      duration: 8000,
      repeat: -1,
    });

    this.tweens.add({
      targets: portalInner,
      rotation: -Math.PI * 2,
      duration: 5000,
      repeat: -1,
    });

    this.fungalHollowsPortal = this.add.container(x, y, [portalGlow, portalCore, portalInner, label, tierLabel]);
    this.fungalHollowsPortal.setDepth(7);
  }

  private createDelveMarker(x: number, y: number, tier: number): Phaser.GameObjects.Container {
    // Safety fallback: default to tier 1 if undefined
    const safeTier = tier ?? 1;
    
    const entrance = this.add.sprite(0, 0, 'delve-entrance');
    entrance.setScale(0.15);
    entrance.setOrigin(0.5, 0.75);
    
    const glow = this.add.circle(0, 0, 32, 0x8844ff, 0.2);
    const label = this.add.text(0, -60, `Delve T${safeTier}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#aa88ff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: glow,
      scale: 1.4,
      alpha: 0.05,
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    const container = this.add.container(x, y, [glow, entrance, label]);
    container.setData('tier', safeTier);
    container.setDepth(7);
    
    return container;
  }

  private async loadTombstones(): Promise<void> {
    try {
      const tombstones = await ApiClient.getMyTombstones();
      tombstones.forEach((tombstone: any) => {
        const marker = this.createTombstoneMarker(tombstone.id, tombstone.world_x, tombstone.world_y);
        this.tombstoneMarkers.set(tombstone.id, marker);
      });
    } catch (error) {
      console.error('Failed to load tombstones:', error);
    }
  }

  private createTombstoneMarker(id: number, x: number, y: number): Phaser.GameObjects.Container {
    const tombstone = this.add.image(0, 0, 'tombstone');
    tombstone.setOrigin(0.5, 0.75);
    tombstone.setScale(0.8);
    
    const glow = this.add.circle(0, 0, 32, 0xff4444, 0.2);
    const label = this.add.text(0, -60, 'Your Corpse', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ff8888',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: glow,
      scale: 1.4,
      alpha: 0.05,
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });

    const container = this.add.container(x, y, [glow, tombstone, label]);
    container.setData('tombstoneId', id);
    container.setDepth(7);

    return container;
  }

  private checkDelveProximity(): void {
    for (let i = this.delveMarkers.length - 1; i >= 0; i--) {
      const marker = this.delveMarkers[i];
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        marker.x,
        marker.y
      );

      if (distance < 50) {
        // Double check if delve is already completed
        if (this.gameState.isDelveCompleted(marker.x, marker.y)) {
          marker.destroy();
          this.delveMarkers.splice(i, 1);
          return;
        }
        this.enterDelve(marker.getData('tier'), marker.x, marker.y);
      }
    }
  }

  private checkTombstoneProximity(): void {
    this.tombstoneMarkers.forEach((marker, tombstoneId) => {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        marker.x,
        marker.y
      );

      if (distance < 50) {
        this.interactWithTombstone(tombstoneId);
      }
    });
  }

  private async interactWithTombstone(tombstoneId: number): Promise<void> {
    // Prevent multiple interactions
    if (this.isOverlayActive) return;
    
    this.isOverlayActive = true;
    
    try {
      const tombstones = await ApiClient.getMyTombstones();
      const tombstone = tombstones.find((t: any) => t.id === tombstoneId);
      
      if (!tombstone) {
        this.showMessage('On investigation, it appears someone has been here already');
        // Remove the marker from the map since it's already looted
        const marker = this.tombstoneMarkers.get(tombstoneId);
        if (marker) {
          marker.destroy();
          this.tombstoneMarkers.delete(tombstoneId);
        }
        this.isOverlayActive = false;
        return;
      }

      // Show loot UI
      this.showTombstoneLootUI(tombstone);
    } catch (error) {
      console.error('Failed to interact with tombstone:', error);
      this.showMessage('Failed to access tombstone');
      this.isOverlayActive = false;
    }
  }

  private async showTombstoneLootUI(tombstone: any): Promise<void> {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0);
    const panel = this.add.rectangle(width / 2, height / 2, 600, 400, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 160, 'Your Corpse', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8888',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(title);

    const itemsList = this.add.text(width / 2, height / 2 - 100, 
      `Items: ${tombstone.items.length} items`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(itemsList);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
    };

    // Loot All button
    const lootBtn = this.createButton(width / 2, height / 2 + 80, 'Loot All Items', async () => {
      const result = await ApiClient.lootTombstone(String(tombstone.id));
      const success = result.success;
      if (success) {
        // Add items to inventory
        tombstone.items.forEach((item: any) => {
          this.gameState.addItemToInventory(item.itemId, item.quantity || 1);
        });
        
        // Remove marker
        const marker = this.tombstoneMarkers.get(tombstone.id);
        if (marker) {
          marker.destroy();
          this.tombstoneMarkers.delete(tombstone.id);
        }
        
        this.showMessage(`Recovered ${tombstone.items.length} items from your corpse`);
        destroyAll();
      } else {
        this.showMessage('Failed to loot tombstone');
      }
    });
    lootBtn.setScrollFactor(0);
    uiElements.push(lootBtn);

    // Leave button
    const leaveBtn = this.createButton(width / 2, height / 2 + 140, 'Leave', () => {
      destroyAll();
    });
    leaveBtn.setScrollFactor(0);
    uiElements.push(leaveBtn);
  }

  private enterDelve(tier: number, x: number, y: number): void {
    // Safety fallback: default to tier 1 if undefined
    const safeTier = tier ?? 1;
    
    const generator = new DelveGenerator();
    const delve = generator.generateDelve(safeTier);
    delve.location = { x, y };
    
    SceneManager.getInstance().transitionTo('delve', { delve });
  }

  private checkRandomEncounter(): void {
    const player = this.gameState.getPlayer();
    const encounterMultiplier = BuffManager.getEncounterRateMultiplier(player);
    const adjustedChance = GameConfig.WORLD.RANDOM_ENCOUNTER_CHANCE * encounterMultiplier;
    
    if (Math.random() < adjustedChance) {
      this.movementStepCounter = 0;
      this.encounterCooldown = true;
      this.triggerEncounter();
    }
  }

  private markNearbyTilesExplored(): void {
    const playerX = this.player.x;
    const playerY = this.player.y;
    const radius = this.VISIBILITY_RADIUS / this.TILE_SIZE;
    
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius) {
          const tileX = playerX + dx * this.TILE_SIZE;
          const tileY = playerY + dy * this.TILE_SIZE;
          this.gameState.markTileExplored(tileX, tileY);
        }
      }
    }
  }

  private updateFogOfWar(): void {
    const playerX = this.player.x;
    const playerY = this.player.y;
    
    const camera = this.cameras.main;
    const viewportWidth = camera.width;
    const viewportHeight = camera.height;
    const cameraX = camera.scrollX;
    const cameraY = camera.scrollY;
    
    this.terrainContainer.removeAll(true);
    this.treeSprites.forEach(tree => tree.destroy());
    this.treeSprites = [];
    this.decorationSprites.forEach(deco => deco.destroy());
    this.decorationSprites = [];
    this.unexploredGraphics.clear();
    this.fogOfWarGraphics.clear();
    
    const startTileX = Math.floor((cameraX - this.TILE_SIZE) / this.TILE_SIZE);
    const endTileX = Math.floor((cameraX + viewportWidth + this.TILE_SIZE) / this.TILE_SIZE);
    const startTileY = Math.floor((cameraY - this.TILE_SIZE) / this.TILE_SIZE);
    const endTileY = Math.floor((cameraY + viewportHeight + this.TILE_SIZE) / this.TILE_SIZE);
    
    for (let tileX = startTileX; tileX <= endTileX; tileX++) {
      for (let tileY = startTileY; tileY <= endTileY; tileY++) {
        const worldX = tileX * this.TILE_SIZE;
        const worldY = tileY * this.TILE_SIZE;
        
        const isExplored = this.gameState.isTileExplored(worldX, worldY);
        
        if (isExplored) {
          const terrainType = TerrainGenerator.generateTile(worldX, worldY);
          this.renderTerrainTile(worldX, worldY, terrainType);
          
          const distanceToPlayer = Phaser.Math.Distance.Between(playerX, playerY, worldX, worldY);
          if (distanceToPlayer > this.VISIBILITY_RADIUS) {
            this.fogOfWarGraphics.fillStyle(0x000000, 0.6);
            this.fogOfWarGraphics.fillRect(worldX, worldY, this.TILE_SIZE, this.TILE_SIZE);
          }
        } else {
          this.unexploredGraphics.fillStyle(0x000000, 1.0);
          this.unexploredGraphics.fillRect(worldX, worldY, this.TILE_SIZE, this.TILE_SIZE);
        }
      }
    }
  }

  private renderTerrainTile(x: number, y: number, terrainType: string): void {
    let color: number;
    
    if (terrainType === 'grass') {
      const variant = TerrainGenerator.getGrassVariant(x, y);
      const grassColors = [0x2d5016, 0x3a6319, 0x22401a];
      color = grassColors[variant];
      const grass = this.add.rectangle(x, y, this.TILE_SIZE, this.TILE_SIZE, color).setOrigin(0);
      this.terrainContainer.add(grass);
    } else if (terrainType === 'path') {
      const path = this.add.rectangle(x, y, this.TILE_SIZE, this.TILE_SIZE, 0x8b7355).setOrigin(0);
      this.terrainContainer.add(path);
    } else if (terrainType === 'tree') {
      const grass = this.add.rectangle(x, y, this.TILE_SIZE, this.TILE_SIZE, 0x2d5016).setOrigin(0);
      this.terrainContainer.add(grass);
      
      // Add tree sprite separately (not to container) so it can have independent depth
      const treeVariation = this.getTreeVariation(x, y);
      const tree = this.add.sprite(x + 16, y + 16, `tree${treeVariation}`);
      tree.setScale(0.12);
      tree.setOrigin(0.5, 0.75);
      // Y-sort trees: higher Y = render in front (depth 8.000x to 8.999x range)
      // This prevents trunks from appearing in front of other trees' canopies
      tree.setDepth(8 + y / 10000);
      
      this.treeSprites.push(tree);
    } else if (terrainType === 'bush') {
      const variant = TerrainGenerator.getGrassVariant(x, y);
      const grassColors = [0x2d5016, 0x3a6319, 0x22401a];
      color = grassColors[variant];
      const grass = this.add.rectangle(x, y, this.TILE_SIZE, this.TILE_SIZE, color).setOrigin(0);
      this.terrainContainer.add(grass);
      
      // Add bush sprite
      const bush = this.add.sprite(x + 16, y + 16, 'bush');
      bush.setScale(0.08);
      bush.setOrigin(0.5, 0.7);
      bush.setDepth(3 + y / 10000);
      
      this.decorationSprites.push(bush);
    } else if (terrainType === 'grass_tuft') {
      const variant = TerrainGenerator.getGrassVariant(x, y);
      const grassColors = [0x2d5016, 0x3a6319, 0x22401a];
      color = grassColors[variant];
      const grass = this.add.rectangle(x, y, this.TILE_SIZE, this.TILE_SIZE, color).setOrigin(0);
      this.terrainContainer.add(grass);
      
      // Add grass tuft sprite (grass1-4)
      const tuftVariation = TerrainGenerator.getGrassTuftVariant(x, y);
      const tuft = this.add.sprite(x + 16, y + 16, `grass${tuftVariation}`);
      tuft.setScale(0.26);
      tuft.setOrigin(0.5, 0.7);
      tuft.setDepth(2 + y / 10000);
      
      this.decorationSprites.push(tuft);
    }
  }

  private getTreeVariation(x: number, y: number): number {
    const hash = ((x * 374761393) + (y * 668265263)) & 0x7FFFFFFF;
    return (hash % 3) + 1;
  }

  private triggerEncounter(): void {
    const encounterType = this.generateRandomEncounter();
    console.log('[ENCOUNTER DEBUG] Generated encounter type:', encounterType.type);
    this.isOverlayActive = true;

    if (encounterType.type === 'combat') {
      this.handleCombatEncounter(encounterType);
    } else if (encounterType.type === 'treasure') {
      this.handleTreasureEncounter(encounterType);
    } else if (encounterType.type === 'shrine') {
      this.handleShrineEncounter(encounterType);
    } else if (encounterType.type === 'corrupted_void_portal') {
      this.handleCorruptedVoidPortalEncounter(encounterType);
    } else if (encounterType.type === 'trapped_chest') {
      this.handleTrappedChestEncounter(encounterType);
    } else if (encounterType.type === 'tombstone') {
      this.handleTombstoneEncounter(encounterType);
    } else if (encounterType.type === 'wandering_merchant') {
      this.handleWanderingMerchantEncounter(encounterType);
    }
  }

  private handleCombatEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, 500, 300, 0x000000, 0.9)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 100, 'Random Encounter!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8844',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 30, encounterType.description, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 400 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText);

    this.time.delayedCall(2000, () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
      this.startWildCombat(encounterType.enemies);
    });
  }

  private handleTreasureEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, 500, 300, 0x000000, 0.9)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 100, 'Treasure Found!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ffcc00',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 30, encounterType.description, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 400 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    const loot = encounterType.loot;
    this.gameState.addArcaneAsh(loot.aa);
    this.gameState.addCrystallineAnimus(loot.ca);
    
    // Save state after collecting treasure
    this.gameState.saveToServer();

    const lootText = this.add.text(width / 2, height / 2 + 40, `+${loot.aa} AA, +${loot.ca} CA`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffcc00',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText, lootText);

    this.time.delayedCall(3000, () => {
      uiElements.forEach(el => el.destroy());
      this.encounterCooldown = false;
      this.isOverlayActive = false;
    });
  }

  private handleShrineEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();

    const overlay = this.add.rectangle(width / 2, height / 2, 520, 280, 0x2a0a2a, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 110, 'Shrine to the Faceless Old God', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#aa44ff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 50, 'Corrupted whispers promise\npower for the faithful.', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const choiceText = this.add.text(width / 2, height / 2 + 20, 'Offer 50 Arcane Ash?', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc88',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText, choiceText);
    
    let buttonsDestroyed = false;
    const destroyButtons = () => {
      if (!buttonsDestroyed) {
        yesBtnBg.destroy();
        yesBtnLabel.destroy();
        noBtnBg.destroy();
        noBtnLabel.destroy();
        buttonsDestroyed = true;
      }
    };
    
    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      destroyButtons();
      this.encounterCooldown = false;
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'encounter';

    const yesBtnBg = this.add.rectangle(width / 2 - 90, height / 2 + 80, 130, 34, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
      if (player.arcaneAsh < 50) {
        choiceText.setText('Not enough Arcane Ash!').setColor('#ff4444');
        this.time.delayedCall(2000, () => {
          destroyAll();
        });
        return;
      }

      this.gameState.addArcaneAsh(-50);
      destroyButtons();

      const roll = Math.random();
      if (roll < 0.70) {
        // Save state after offering is consumed (even with no reward)
        this.gameState.saveToServer();
        
        choiceText.setText('The void accepts your offering...\nbut grants nothing in return.').setColor('#888888');
        this.time.delayedCall(3000, () => {
          uiElements.forEach(el => el.destroy());
          this.encounterCooldown = false;
          this.isOverlayActive = false;
        });
      } else {
        const outcomeRoll = Math.random();
        let outcomeMessage = '';
        
        if (outcomeRoll < 0.25) {
          BuffManager.addBuff(player, 'enraged_spirit');
          this.gameState.updatePlayer(player);
          outcomeMessage = 'Blessing of the Enraged Spirit!\n+5 damage per hit for 1 hour';
        } else if (outcomeRoll < 0.50) {
          BuffManager.addBuff(player, 'catriena_blessing');
          this.gameState.updatePlayer(player);
          outcomeMessage = "Blessing of the Angel Cat'riena!\n+1d4 to all attack rolls for 1 hour";
        } else if (outcomeRoll < 0.75) {
          BuffManager.addBuff(player, 'aroma_of_void');
          this.gameState.updatePlayer(player);
          outcomeMessage = 'Aroma of the Void!\n2x encounter rate until town return';
        } else {
          const weaponList = ShopData.getWeaponShopItems();
          const randomWeapon = weaponList[Math.floor(Math.random() * weaponList.length)];
          player.inventory.push({ itemId: randomWeapon.itemId, quantity: 1 });
          this.gameState.updatePlayer(player);
          const weaponData = ItemDatabase.getWeapon(randomWeapon.itemId);
          outcomeMessage = `The void bestows a gift!\nReceived: ${weaponData?.name || 'weapon'}`;
        }
        
        // Save state after shrine blessing/gift
        this.gameState.saveToServer();

        choiceText.setText(outcomeMessage).setColor('#44ff44');
        this.time.delayedCall(3500, () => {
          uiElements.forEach(el => el.destroy());
          this.encounterCooldown = false;
          this.isOverlayActive = false;
        });
      }
    });

    const yesBtnLabel = this.add.text(width / 2 - 90, height / 2 + 80, 'Offer 50AA', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);

    const noBtnBg = this.add.rectangle(width / 2 + 90, height / 2 + 80, 130, 34, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        destroyAll();
      });

    const noBtnLabel = this.add.text(width / 2 + 90, height / 2 + 80, 'Decline', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);
  }

  private handleCorruptedVoidPortalEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, 500, 350, 0x1a0a2a, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 130, 'Corrupted Void Portal', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#8844ff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 70, encounterType.description, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 450 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const choiceText = this.add.text(width / 2, height / 2, 'Enter the void?\n2 stages: enemies + boss battle!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc88',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText, choiceText);
    
    let buttonsDestroyed = false;
    const destroyButtons = () => {
      if (!buttonsDestroyed) {
        enterBtnBg.destroy();
        enterBtnLabel.destroy();
        fleeBtnBg.destroy();
        fleeBtnLabel.destroy();
        buttonsDestroyed = true;
      }
    };
    
    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      destroyButtons();
      this.encounterCooldown = false;
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'encounter';

    const enterBtnBg = this.add.rectangle(width / 2 - 70, height / 2 + 70, 140, 30, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        destroyAll();
        this.startVoidPortalDelve();
      });

    const enterBtnLabel = this.add.text(width / 2 - 70, height / 2 + 70, 'Enter', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);

    const fleeBtnBg = this.add.rectangle(width / 2 + 70, height / 2 + 70, 140, 30, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        destroyAll();
      });

    const fleeBtnLabel = this.add.text(width / 2 + 70, height / 2 + 70, 'Flee', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);
    
    // ESC key support
    const escHandler = () => {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    };
    this.escKey.once('down', escHandler);
  }
  
  private startVoidPortalDelve(): void {
    // Create a mini 2-room delve with tier-appropriate enemies
    const generator = new DelveGenerator();
    const voidDelve = generator.generateDelve(1); // T1 zone
    
    // Clear existing rooms and create exactly 2 rooms
    voidDelve.rooms.clear();
    
    // Room 1: Combat with tier-appropriate enemies (T1 or T2)
    // enemyIds are just markers - CombatScene will generate actual enemies
    const numEnemies = Math.floor(Math.random() * 2) + 1; // 1-2 enemies
    const room1Enemies: string[] = [];
    
    for (let i = 0; i < numEnemies; i++) {
      const tier = Math.random() < 0.5 ? 1 : 2; // Mix of T1 and T2
      // Store tier info as enemy ID marker (will be parsed in CombatScene)
      room1Enemies.push(`tier_${tier}_normal`);
    }
    
    const room1 = {
      id: 'void_room_1',
      type: 'combat' as const,
      completed: false,
      connections: ['void_room_2'],
      enemyIds: room1Enemies,
    };
    
    // Room 2: Boss battle with T1 boss
    const room2 = {
      id: 'void_room_2',
      type: 'boss' as const,
      completed: false,
      connections: [],
      enemyIds: ['tier_1_boss'],
    };
    
    voidDelve.rooms.set('void_room_1', room1);
    voidDelve.rooms.set('void_room_2', room2);
    voidDelve.currentRoomId = 'void_room_1';
    voidDelve.entranceRoomId = 'void_room_1';
    voidDelve.bossRoomId = 'void_room_2';
    
    SceneManager.getInstance().transitionTo('combat', {
      delve: voidDelve,
      room: room1,
      wildEncounter: false,
      returnToLocation: { x: this.player.x, y: this.player.y },
    });
  }

  private handleTrappedChestEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();

    const overlay = this.add.rectangle(width / 2, height / 2, 500, 320, 0x2a1a0a, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 120, 'Trapped Chest!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8844',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 60, encounterType.description + '\n\nDo you want to attempt to pick the lock?', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 450 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText);

    const closeEncounter = () => {
      uiElements.forEach(el => el.destroy());
      this.encounterCooldown = false;
      this.isOverlayActive = false;
    };

    // Attempt button
    const attemptBtn = this.createButton(width / 2 - 100, height / 2 + 20, 'Attempt', () => {
      // Remove buttons
      attemptBtn.destroy();
      leaveBtn.destroy();
      
      // Update description
      descText.setText('Attempting to disarm the trap...');
      
      this.time.delayedCall(1500, () => {
        const skillCheck = Math.random();
        
        if (skillCheck < 0.60) {
          const aa = Math.floor(Math.random() * 41) + 40;
          const ca = Math.floor(Math.random() * 4) + 3;
          
          this.gameState.addArcaneAsh(aa);
          this.gameState.addCrystallineAnimus(ca);
          this.gameState.saveToServer();

          const resultText = this.add.text(width / 2, height / 2 + 40, 
            `Success! Disarmed the trap!\n+${aa} AA, +${ca} CA`, {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.medium,
            color: '#44ff44',
            align: 'center',
          }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
          uiElements.push(resultText);
        } else {
          const damage = Math.floor(Math.random() * 11) + 15;
          player.health = Math.max(0, player.health - damage);
          this.gameState.updatePlayer(player);
          this.gameState.saveToServer();

          const resultText = this.add.text(width / 2, height / 2 + 40, 
            `Failed! The trap triggers!\nTook ${damage} damage!`, {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.medium,
            color: '#ff4444',
            align: 'center',
          }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
          uiElements.push(resultText);
        }

        this.time.delayedCall(2500, closeEncounter);
      });
    }).setScrollFactor(0).setDepth(1001);
    uiElements.push(attemptBtn);

    // Leave button
    const leaveBtn = this.createButton(width / 2 + 100, height / 2 + 20, 'Leave It', () => {
      closeEncounter();
    }).setScrollFactor(0).setDepth(1001);
    uiElements.push(leaveBtn);
  }

  private handleWanderingMerchantEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    // Full-screen dark overlay (matching Blacksmith style)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8)
      .setOrigin(0).setScrollFactor(0).setDepth(1000);
    
    // Main panel (matching Blacksmith dimensions)
    const panel = this.add.rectangle(width / 2, height / 2, 800, 450, 0x2a2a3e)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    uiElements.push(overlay, panel);

    // Header layout with proper vertical spacing
    const headerBaseY = height / 2 - 180;
    const verticalGap = 45;

    // Row 1: Title
    const titleText = this.add.text(width / 2, headerBaseY, 'Wandering Merchant', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ffaa44',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    // Row 2: Description
    const descText = this.add.text(width / 2, headerBaseY + verticalGap, 
      '"Care to peruse my wares, traveler?"', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    // Row 3: Section subtitle
    const subtitle = this.add.text(width / 2, headerBaseY + verticalGap * 2, 
      'Enhanced Items for Sale:', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc88',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(titleText, descText, subtitle);
    
    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.encounterCooldown = false;
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'encounter';

    // Select 3 random weapons/armor for enhancement (exclude potions)
    const forgeableItems = [...ShopData.getWeaponShopItems(), ...ShopData.getArmorShopItems()];
    const selectedItems = [];
    for (let i = 0; i < 3; i++) {
      const randomItem = forgeableItems[Math.floor(Math.random() * forgeableItems.length)];
      const enhancement = Math.random() < 0.5 ? 1 : 2; // +1 or +2
      selectedItems.push({ ...randomItem, enhancement });
    }

    // Column layout for items (matching Blacksmith forge style)
    const itemStartY = headerBaseY + verticalGap * 3 + 10;
    const rowHeight = 50;
    const leftColumnX = width / 2 - 320;  // Item name column
    const priceColumnX = width / 2 + 160;  // Price column (right-aligned before button)
    const buttonColumnX = width / 2 + 280; // Buy button column

    selectedItems.forEach((shopItem, index) => {
      const yPos = itemStartY + (index * rowHeight);
      const itemData = ItemDatabase.getItem(shopItem.itemId);
      const basePrice = shopItem.price;
      
      // Calculate forge cost (sum of all tiers up to enhancement level)
      let forgeCost = { aa: 0, ca: 0 };
      for (let level = 1; level <= shopItem.enhancement; level++) {
        const tierCost = ForgingSystem.getForgingCost(level);
        if (tierCost) {
          forgeCost.aa += tierCost.aa;
          forgeCost.ca += tierCost.ca;
        }
      }
      
      // Total price = base + forge cost + 50% markup (CA must be integer)
      const totalAA = Math.floor((basePrice + forgeCost.aa) * 1.5);
      const totalCA = Math.ceil(forgeCost.ca * 1.5);
      
      const enhancedName = ExploreScene.getEnhancedItemName(
        itemData?.name || shopItem.itemId, 
        shopItem.enhancement, 
        false
      );
      const nameColor = ExploreScene.getEnhancementColor(shopItem.enhancement, false);
      
      // Item name (left-aligned)
      const itemText = this.add.text(leftColumnX, yPos, enhancedName, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: nameColor,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(1001);
      
      // Price (right-aligned before button) - compact format
      const priceString = totalCA > 0 
        ? `${totalAA} AA, ${totalCA} CA` 
        : `${totalAA} AA`;
      const priceText = this.add.text(priceColumnX, yPos, priceString, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#ffffff',
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(1001);
      
      // Buy button (right column)
      const buyBtn = this.createButton(buttonColumnX, yPos, 'Buy', () => {
        const player = this.gameState.getPlayer();
        const canAfford = player.arcaneAsh >= totalAA && player.crystallineAnimus >= totalCA;

        if (!canAfford) {
          priceText.setColor('#ff4444');
          this.time.delayedCall(500, () => priceText.setColor('#ffffff'));
          return;
        }

        this.gameState.addArcaneAsh(-totalAA);
        if (totalCA > 0) {
          this.gameState.addCrystallineAnimus(-totalCA);
        }

        player.inventory.push({ 
          itemId: shopItem.itemId, 
          quantity: 1,
          enhancementLevel: shopItem.enhancement,
          durability: 100,
          maxDurability: 100,
        });
        this.gameState.updatePlayer(player);
        
        itemText.setColor('#44ff44');
        priceText.setText('SOLD').setColor('#44ff44');
        buyBtn.setVisible(false);
      }).setScrollFactor(0).setDepth(1002);

      uiElements.push(itemText, priceText, buyBtn);
    });

    // Leave button at bottom
    const closeBtn = this.createButton(width / 2, height / 2 + 170, 'Leave', () => {
      destroyAll();
    }).setScrollFactor(0).setDepth(1002);
    uiElements.push(closeBtn);
    
    // ESC key support
    const escHandler = () => {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    };
    this.escKey.once('down', escHandler);
  }

  private async handleTombstoneEncounter(encounterType: any): Promise<void> {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, 700, 500, 0x1a1a2e, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 220, 'Fallen Adventurer', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff4444',
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 170, encounterType.description, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 600 },
      resolution: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.encounterCooldown = false;
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'encounter';

    // Try to fetch a random tombstone from other players
    try {
      const tombstone = await ApiClient.getRandomTombstone();
      const tombstones = tombstone ? [tombstone] : [];
      
      if (tombstones.length === 0) {
        // No tombstones available
        const noLootText = this.add.text(width / 2, height / 2 - 50, 
          'The body has already been looted.\nNothing remains.', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#888888',
          align: 'center',
          resolution: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
        uiElements.push(noLootText);

        const continueBtn = this.createButton(width / 2, height / 2 + 200, 'Continue', () => {
          destroyAll();
        }).setScrollFactor(0).setDepth(1002);
        uiElements.push(continueBtn);
      } else {
        const tombstone = tombstones[0];
        
        // Show tombstone info
        const ownerText = this.add.text(width / 2, height / 2 - 120, 
          `${tombstone.owner_name}'s remains`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#cccccc',
          resolution: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
        uiElements.push(ownerText);

        // Display items
        let yPos = height / 2 - 80;
        tombstone.items.forEach((item: any, index: number) => {
          const itemData = ItemDatabase.getItem(item.itemId);
          if (!itemData) return;

          const itemColor = ExploreScene.getEnhancementColor(item.enhancement || 0, item.isShiny || false);
          const itemName = ExploreScene.getEnhancedItemName(itemData.name, item.enhancement || 0, item.isShiny || false);
          
          const itemText = this.add.text(width / 2 - 280, yPos, itemName, {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.xsmall,
            color: itemColor,
            resolution: 2,
          }).setScrollFactor(0).setDepth(1001);
          
          uiElements.push(itemText);
          yPos += 28;
        });

        // Take All button
        const takeAllBtn = this.createButton(width / 2 - 100, height / 2 + 200, 'Take All', async () => {
          await this.lootTombstone(tombstone, uiElements, destroyAll);
        }).setScrollFactor(0).setDepth(1002);

        const leaveBtn = this.createButton(width / 2 + 100, height / 2 + 200, 'Leave', () => {
          destroyAll();
        }).setScrollFactor(0).setDepth(1002);

        uiElements.push(takeAllBtn, leaveBtn);
      }
    } catch (error) {
      console.error('Failed to fetch random tombstones:', error);
      
      const errorText = this.add.text(width / 2, height / 2 - 50, 
        'Failed to examine the remains.', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#ff4444',
        resolution: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
      uiElements.push(errorText);

      const closeBtn = this.createButton(width / 2, height / 2 + 200, 'Continue', () => {
        destroyAll();
      }).setScrollFactor(0).setDepth(1002);
      uiElements.push(closeBtn);
    }

    // ESC key support
    const escHandler = () => {
      destroyAll();
    };
    this.escKey.once('down', escHandler);
  }

  private async lootTombstone(tombstone: any, uiElements: Phaser.GameObjects.GameObject[], destroyAll: () => void): Promise<void> {
    const player = this.gameState.getPlayer();
    const availableSlots = 15 - player.inventory.length;
    const itemsToLoot = tombstone.items;

    // Check if inventory has space
    if (itemsToLoot.length > availableSlots) {
      // Show overflow UI
      this.showInventoryOverflowUI(tombstone, itemsToLoot, availableSlots, uiElements, destroyAll);
    } else {
      // Can take everything
      try {
        await ApiClient.lootTombstone(tombstone.id);
        
        // Add items to inventory
        itemsToLoot.forEach((item: any) => {
          player.inventory.push(item);
        });
        this.gameState.updatePlayer(player);
        
        destroyAll();
        this.showMessage(`Looted ${itemsToLoot.length} items from tombstone`);
        
        // Reload tombstones to update markers
        this.tombstoneMarkers.clear();
        await this.loadTombstones();
      } catch (error) {
        console.error('Failed to loot tombstone:', error);
        this.showMessage('Failed to loot tombstone');
      }
    }
  }

  private showInventoryOverflowUI(tombstone: any, items: any[], availableSlots: number, oldElements: Phaser.GameObjects.GameObject[], oldDestroyAll: () => void): void {
    // Destroy old UI
    oldDestroyAll();

    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, 700, 550, 0x1a1a2e, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    
    const titleText = this.add.text(width / 2, height / 2 - 250, 'Inventory Full!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff4444',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    const infoText = this.add.text(width / 2, height / 2 - 210, 
      `You can only carry ${availableSlots} more items.\nSelect ${items.length - availableSlots} items to drop:`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, infoText);

    const player = this.gameState.getPlayer();
    const selectedToDrop: Set<number> = new Set();
    const neededToDrop = items.length - availableSlots;

    // Show current inventory items
    let yPos = height / 2 - 160;
    player.inventory.forEach((invItem: any, index: number) => {
      const itemData = ItemDatabase.getItem(invItem.itemId);
      if (!itemData) return;

      const itemColor = ExploreScene.getEnhancementColor(invItem.enhancement || 0, invItem.isShiny || false);
      const itemName = ExploreScene.getEnhancedItemName(itemData.name, invItem.enhancement || 0, invItem.isShiny || false);
      
      const itemText = this.add.text(width / 2 - 280, yPos, itemName, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
      }).setScrollFactor(0).setDepth(1001);

      const buttonText = this.add.text(width / 2 + 200, yPos, selectedToDrop.has(index) ? '[X]' : '[ ]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);
      
      const buttonBg = this.add.rectangle(width / 2 + 200, yPos, 50, 25, 0x444444, 0.8)
        .setOrigin(0.5).setScrollFactor(0).setDepth(1002)
        .setInteractive()
        .on('pointerdown', () => {
          if (selectedToDrop.has(index)) {
            selectedToDrop.delete(index);
            buttonText.setText('[ ]');
          } else {
            selectedToDrop.add(index);
            buttonText.setText('[X]');
          }
        });

      uiElements.push(itemText, buttonBg, buttonText);
      yPos += 30;

      if (yPos > height / 2 + 160) return; // Stop if too many items
    });

    // Confirm button
    const confirmBtn = this.createButton(width / 2, height / 2 + 240, 'Confirm', async () => {
      if (selectedToDrop.size !== neededToDrop) {
        this.showMessage(`Must select exactly ${neededToDrop} items to drop`);
        return;
      }

      try {
        // Drop selected items
        const droppedItems = Array.from(selectedToDrop).sort((a, b) => b - a).map(idx => {
          return player.inventory.splice(idx, 1)[0];
        });

        // Add looted items
        items.forEach((item: any) => {
          player.inventory.push(item);
        });

        this.gameState.updatePlayer(player);
        await ApiClient.lootTombstone(tombstone.id);

        uiElements.forEach(el => el.destroy());
        this.isOverlayActive = false;
        this.menuState = 'none';
        this.currentMenuCloseFunction = null;
        this.encounterCooldown = false;

        this.showMessage(`Dropped ${droppedItems.length} items and looted ${items.length} items`);
        
        // Reload tombstones
        this.tombstoneMarkers.clear();
        await this.loadTombstones();
      } catch (error) {
        console.error('Failed to loot tombstone:', error);
        this.showMessage('Failed to loot tombstone');
      }
    }).setScrollFactor(0).setDepth(1002);

    uiElements.push(confirmBtn);

    this.currentMenuCloseFunction = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
      this.encounterCooldown = false;
    };

    // ESC key support
    const escHandler = () => {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    };
    this.escKey.once('down', escHandler);
  }

  private generateRandomEncounter(): any {
    const roll = Math.random();
    console.log('[ENCOUNTER DEBUG] Random roll:', roll);
    
    if (roll < 0.38) {
      // 15% chance for a rare Aetherbear boss encounter
      if (Math.random() < 0.15) {
        const aetherbear = EnemyFactory.createAetherbear();
        return {
          type: 'combat',
          description: 'A massive Aetherbear emerges from the wilderness!',
          enemies: [aetherbear],
        };
      }
      
      // Standard wilderness combat encounters
      const numEnemies = Math.floor(Math.random() * 2) + 1;
      const enemies = [];
      
      // T1 zone encounters: max 1 T2 enemy allowed
      let t2Count = 0;
      for (let i = 0; i < numEnemies; i++) {
        const tier = Math.floor(Math.random() * 2) + 1; // 1 or 2
        
        // If we already have a T2 enemy, force T1 for remaining enemies
        if (tier === 2 && t2Count >= 1) {
          enemies.push(EnemyFactory.createEnemy(1, false));
        } else {
          enemies.push(EnemyFactory.createEnemy(tier, false));
          if (tier === 2) t2Count++;
        }
      }
      
      return {
        type: 'combat',
        description: `You've been ambushed by ${numEnemies} ${enemies[0].name}${numEnemies > 1 ? 's' : ''}!`,
        enemies,
      };
    } else if (roll < 0.58) {
      const aa = Math.floor(Math.random() * 41) + 40;
      const ca = Math.floor(Math.random() * 4) + 3; // 3-6 CA (whole numbers)
      
      return {
        type: 'treasure',
        description: 'You stumble upon a hidden cache of resources!',
        loot: { aa, ca },
      };
    } else if (roll < 0.73) {
      return {
        type: 'shrine',
        description: 'You discover a shrine to the Faceless Old God...\nCorrupted whispers promise power for the faithful.',
      };
    } else if (roll < 0.83) {
      return {
        type: 'corrupted_void_portal',
        description: 'A corrupted void portal tears through reality before you.\nDangerous... but potentially rewarding.',
      };
    } else if (roll < 0.93) {
      return {
        type: 'trapped_chest',
        description: 'You spot an ornate chest partially buried in the earth.',
      };
    } else if (roll < 0.98) {
      return {
        type: 'tombstone',
        description: 'You discover the remains of a fallen adventurer...\nTheir equipment lies scattered around them.',
      };
    } else {
      return {
        type: 'wandering_merchant',
        description: 'A mysterious merchant appears from the shadows...\n"Care to peruse my wares, traveler?"',
      };
    }
  }

  private startWildCombat(enemies: any[]): void {
    const generator = new DelveGenerator();
    const mockDelve = generator.generateDelve(1);
    const mockRoom = mockDelve.rooms.get(mockDelve.entranceRoomId)!;
    mockRoom.type = 'combat';
    
    SceneManager.getInstance().transitionTo('combat', {
      delve: mockDelve,
      room: mockRoom,
      wildEncounter: true,
      wildEnemies: enemies,
      returnToLocation: { x: this.player.x, y: this.player.y },
    });
  }

  private takeShortRest(): void {
    const player = this.gameState.getPlayer();
    
    const restOverlay = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      400,
      200,
      0x000000,
      0.8
    ).setOrigin(0.5).setScrollFactor(0);

    const restingText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 40,
      'Resting...',
      {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.large,
        color: '#ffffff',
      }
    ).setOrigin(0.5).setScrollFactor(0);

    this.isOverlayActive = true;

    this.time.delayedCall(GameConfig.STAMINA.REST_DURATION, () => {
      const encounterChance = GameConfig.STAMINA.WILDERNESS_ENCOUNTER_CHANCE_WHILE_RESTING;
      
      if (Math.random() < encounterChance) {
        restingText.setText('Ambushed during rest!');
        this.time.delayedCall(1500, () => {
          restOverlay.destroy();
          restingText.destroy();
          this.encounterCooldown = false;
          this.isOverlayActive = false;
          
          const numEnemies = Math.floor(Math.random() * 2) + 1;
          const enemies = [];
          for (let i = 0; i < numEnemies; i++) {
            enemies.push(EnemyFactory.createWildEnemy());
          }
          this.startWildCombat(enemies);
        });
      } else {
        const healthRecovered = Math.floor(player.maxHealth * GameConfig.STAMINA.REST_RECOVERY_PERCENT);
        const staminaRecovered = Math.floor(player.maxStamina * GameConfig.STAMINA.REST_RECOVERY_PERCENT);
        
        player.health = Math.min(player.maxHealth, player.health + healthRecovered);
        player.stamina = Math.min(player.maxStamina, player.stamina + staminaRecovered);
        this.gameState.updatePlayer(player);
        
        restingText.setText(`Rested!\n+${healthRecovered} HP, +${staminaRecovered} Stamina`);
        
        this.time.delayedCall(2000, () => {
          restOverlay.destroy();
          restingText.destroy();
          this.isOverlayActive = false;
        });
      }
    });
  }

  private updateInfo(): void {
    const player = this.gameState.getPlayer();
    
    // Update stats panel
    if (this.statsPanel) {
      this.statsPanel.update(player);
    }

    // Pulsing effect when below 15%
    if (this.statsPanel) {
      const healthPercent = player.health / player.maxHealth;
      const panelContainer = this.statsPanel.getContainer();
      if (healthPercent < 0.15) {
        if (panelContainer && !this.tweens.getTweensOf(panelContainer).length) {
          this.tweens.add({
            targets: panelContainer,
            alpha: 0.3,
            duration: 500,
            yoyo: true,
            repeat: -1,
          });
        }
      } else {
        if (panelContainer) {
          this.tweens.killTweensOf(panelContainer);
          panelContainer.setAlpha(1);
        }
      }
    }
  }

  private checkTownPortalProximity(): void {
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.townPortal.x,
      this.townPortal.y
    );

    if (distance < 50) {
      // Transition back to town - preserve delve state for quick hopping
      // Delves are only cleared on fresh expeditions (death/respawn)
      SceneManager.getInstance().transitionTo('town');
    }
  }

  private checkFungalHollowsPortalProximity(): void {
    if (!this.fungalHollowsPortal) return;

    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.fungalHollowsPortal.x,
      this.fungalHollowsPortal.y
    );

    if (distance < 60) {
      SceneManager.getInstance().transitionTo('fungalHollows');
    }
  }

  private handleEscapeKey(): void {
    if (this.menuState === 'inventory') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    } else if (this.menuState === 'equipment') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    } else if (this.menuState === 'main') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    } else if (this.menuState === 'quit') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    } else if (this.menuState === 'encounter') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    } else {
      // No menu open, open ESC menu
      this.scene.launch('EscMenuScene', { parentKey: this.scene.key });
      this.scene.pause();
    }
  }

  private openMenu(): void {
    if (this.isOverlayActive) return;
    this.isOverlayActive = true;
    
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(999);
    uiElements.push(overlay);

    const panel = this.add.rectangle(width / 2, height / 2, 400, 350, 0x2a2a3e)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);
    uiElements.push(panel);

    const title = this.add.text(width / 2, height / 2 - 120, 'Menu', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'main';

    // Simple text buttons (no containers)
    const inventoryBtn = this.add.text(width / 2, height / 2 - 50, '[ Inventory ]', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10000)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function(this: Phaser.GameObjects.Text) { this.setColor('#ffff00'); })
      .on('pointerout', function(this: Phaser.GameObjects.Text) { this.setColor('#ffffff'); })
      .on('pointerdown', () => {
        destroyAll();
        this.openInventory();
      });
    uiElements.push(inventoryBtn);

    const equipmentBtn = this.add.text(width / 2, height / 2, '[ Equipment ]', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10000)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function(this: Phaser.GameObjects.Text) { this.setColor('#ffff00'); })
      .on('pointerout', function(this: Phaser.GameObjects.Text) { this.setColor('#ffffff'); })
      .on('pointerdown', () => {
        destroyAll();
        this.openEquipment();
      });
    uiElements.push(equipmentBtn);

    const player = this.gameState.getPlayer();
    const maxRests = GameConfig.STAMINA.MAX_WILDERNESS_RESTS;
    const restsText = `[ Short Rest ] (${player.wildernessRestsRemaining}/${maxRests} remaining)`;
    const shortRestBtn = this.add.text(width / 2, height / 2 + 50, restsText, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10000)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function(this: Phaser.GameObjects.Text) { this.setColor('#88ff88'); })
      .on('pointerout', function(this: Phaser.GameObjects.Text) { this.setColor('#ffffff'); })
      .on('pointerdown', () => {
        destroyAll();
        this.attemptShortRest();
      });
    uiElements.push(shortRestBtn);

    const exitBtn = this.add.text(width / 2, height / 2 + 100, '[ Exit Game ]', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10000)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function(this: Phaser.GameObjects.Text) { this.setColor('#ff6666'); })
      .on('pointerout', function(this: Phaser.GameObjects.Text) { this.setColor('#ffffff'); })
      .on('pointerdown', () => {
        destroyAll();
        this.scene.start('MainMenuScene');
      });
    uiElements.push(exitBtn);

    const closeBtn = this.add.text(width / 2, height / 2 + 150, '[ Close Menu ]', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10000)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function(this: Phaser.GameObjects.Text) { this.setColor('#00ff00'); })
      .on('pointerout', function(this: Phaser.GameObjects.Text) { this.setColor('#ffffff'); })
      .on('pointerdown', () => {
        destroyAll();
      });
    uiElements.push(closeBtn);

    this.isOverlayActive = true;
  }

  private openQuitMenu(): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0);
    const panel = this.add.rectangle(width / 2, height / 2, 400, 250, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 100, 'Quit Game?', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff6666',
    }).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'quit';

    const quitBtn = this.createButton(width / 2, height / 2 - 20, 'Return to Main Menu', () => {
      destroyAll();
      this.scene.start('MainMenuScene');
    }).setScrollFactor(0);
    uiElements.push(quitBtn);

    const cancelBtn = this.createButton(width / 2, height / 2 + 40, 'Cancel', () => {
      destroyAll();
    }).setScrollFactor(0);
    uiElements.push(cancelBtn);

    this.isOverlayActive = true;
  }

  private openInventory(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 700, 500, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 220, `Inventory (${player.inventory.reduce((sum, item) => sum + item.quantity, 0)}/${player.inventorySlots})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'inventory';

    const itemsStartY = height / 2 - 180;
    const itemHeight = 30;
    const maxDisplay = 12;

    let displayedItems = 0;
    player.inventory.forEach((invItem, index) => {
      if (displayedItems >= maxDisplay) return;

      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) return;

      const y = itemsStartY + displayedItems * itemHeight;
      
      const itemLabel = this.add.text(width / 2 - 320, y, `${item.name} x${invItem.quantity}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
      }).setScrollFactor(0).setDepth(1001);
      uiElements.push(itemLabel);

      const weapon = ItemDatabase.getWeapon(invItem.itemId);
      const armor = ItemDatabase.getArmor(invItem.itemId);
      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (weapon) {
        if (weapon.twoHanded) {
          const equipBtn = this.add.text(width / 2 + 70, y, '[Equip]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            }).setScrollFactor(0).setDepth(1002);
          uiElements.push(equipBtn);
        } else {
          const equipMHBtn = this.add.text(width / 2 + 40, y, '[Equip MH]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            }).setScrollFactor(0).setDepth(1002);
          uiElements.push(equipMHBtn);

          const equipOHBtn = this.add.text(width / 2 + 115, y, '[Equip OH]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'offHand');
              destroyAll();
              this.openInventory();
            }).setScrollFactor(0).setDepth(1002);
          uiElements.push(equipOHBtn);
        }
      } else if (armor) {
        const equipBtn = this.add.text(width / 2 + 70, y, '[Equip]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#88ff88',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.equipItemFromInventory(invItem.itemId);
            destroyAll();
            this.openInventory();
          }).setScrollFactor(0).setDepth(1002);
        uiElements.push(equipBtn);
      }

      if (isPotion) {
        const useBtn = this.add.text(width / 2 + 140, y, '[Use]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#8888ff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.usePotion(invItem.itemId);
            destroyAll();
            this.openInventory();
          }).setScrollFactor(0).setDepth(1002);
        uiElements.push(useBtn);
      }

      displayedItems++;
    });

    const closeBtn = this.createButton(width / 2, height / 2 + 220, 'Close', () => {
      destroyAll();
    }).setScrollFactor(0).setDepth(1002);
    uiElements.push(closeBtn);

    this.isOverlayActive = true;
  }

  private equipItemFromInventory(itemId: string, targetSlot?: keyof PlayerEquipment): void {
    const player = this.gameState.getPlayer();
    
    const weapon = ItemDatabase.getWeapon(itemId);
    const armor = ItemDatabase.getArmor(itemId);

    if (weapon) {
      const slot = targetSlot || 'mainHand';
      const result = EquipmentManager.equipItem(player, itemId, slot);
      this.showMessage(result.message);
      if (result.success) {
        this.gameState.updatePlayer(player);
      }
    } else if (armor) {
      let slot: keyof PlayerEquipment = 'chest';
      if (armor.slot === 'shield') {
        slot = 'offHand';
      } else {
        slot = armor.slot as keyof PlayerEquipment;
      }
      
      const result = EquipmentManager.equipItem(player, itemId, slot);
      this.showMessage(result.message);
      if (result.success) {
        this.gameState.updatePlayer(player);
      }
    }
  }

  private usePotion(itemId: string): void {
    const player = this.gameState.getPlayer();
    const potion = ItemDatabase.getPotion(itemId);
    
    if (!potion) return;

    const restorationRoll = DiceRoller.rollDiceTotal(potion.restoration);
    const amount = restorationRoll.total;

    if (potion.type === 'health') {
      const newHealth = Math.min(player.maxHealth, player.health + amount);
      this.showMessage(`Used ${potion.name}! Restored ${amount} HP`);
      this.gameState.removeItemFromInventory(itemId, 1);
      this.gameState.updatePlayer({ health: newHealth });
    } else if (potion.type === 'stamina') {
      const newStamina = Math.min(player.maxStamina, player.stamina + amount);
      this.showMessage(`Used ${potion.name}! Restored ${amount} Stamina`);
      this.gameState.removeItemFromInventory(itemId, 1);
      this.gameState.updatePlayer({ stamina: newStamina });
    }
  }

  private attemptShortRest(): void {
    const player = this.gameState.getPlayer();
    
    if (player.health >= player.maxHealth && player.stamina >= player.maxStamina) {
      this.showMessage('You are already fully rested!');
      return;
    }

    if (player.wildernessRestsRemaining <= 0) {
      this.showMessage('No rests remaining! Return to town to reset.');
      return;
    }

    const recoveryPercent = GameConfig.STAMINA.REST_RECOVERY_PERCENT;
    const healthRecovered = Math.floor(player.maxHealth * recoveryPercent);
    const staminaRecovered = Math.floor(player.maxStamina * recoveryPercent);
    
    player.health = Math.min(player.maxHealth, player.health + healthRecovered);
    player.stamina = Math.min(player.maxStamina, player.stamina + staminaRecovered);
    player.wildernessRestsRemaining--;
    
    this.gameState.updatePlayer(player);
    
    this.showMessage(`Resting... Recovered ${healthRecovered} HP and ${staminaRecovered} Stamina (${player.wildernessRestsRemaining} rests remaining)`);
    
    const encounterChance = GameConfig.STAMINA.WILDERNESS_ENCOUNTER_CHANCE_WHILE_RESTING;
    const encounterRoll = Math.random();
    
    if (encounterRoll < encounterChance) {
      this.time.delayedCall(1500, () => {
        this.showMessage('Your rest was interrupted by an enemy!');
        this.time.delayedCall(1000, () => {
          this.triggerEncounter();
        });
      });
    }
  }

  private openEquipment(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 700, 550, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 250, 'Equipment', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'equipment';

    const slots: Array<{ key: keyof PlayerEquipment; label: string }> = [
      { key: 'mainHand', label: 'Main Hand' },
      { key: 'offHand', label: 'Off Hand' },
      { key: 'helmet', label: 'Helmet' },
      { key: 'chest', label: 'Chest' },
      { key: 'legs', label: 'Legs' },
      { key: 'boots', label: 'Boots' },
      { key: 'shoulders', label: 'Shoulders' },
      { key: 'cape', label: 'Cape' },
    ];

    const startY = height / 2 - 200;
    const slotHeight = 35;

    slots.forEach((slot, index) => {
      const y = startY + index * slotHeight;
      
      const slotLabel = this.add.text(width / 2 - 320, y, `${slot.label}:`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#aaaaaa',
      }).setScrollFactor(0).setDepth(1001);
      uiElements.push(slotLabel);

      const equipped = player.equipment[slot.key];
      const item = equipped ? ItemDatabase.getItem(equipped.itemId) : null;
      const itemName = equipped ? ForgingSystem.getItemDisplayName({ itemId: equipped.itemId, quantity: 1, enhancementLevel: equipped.enhancementLevel }) : 'Empty';

      const itemLabel = this.add.text(width / 2 - 200, y, itemName, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: item ? '#ffffff' : '#666666',
      }).setScrollFactor(0).setDepth(1001);
      uiElements.push(itemLabel);
    });

    const statsTitle = this.add.text(width / 2 - 320, height / 2 + 100, 'Stats:', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffaa00',
    }).setScrollFactor(0).setDepth(1001);
    uiElements.push(statsTitle);

    const statsText = this.add.text(width / 2 - 320, height / 2 + 130, [
      `Evasion: ${player.stats.calculatedEvasion}`,
      `Damage Reduction: ${Math.floor(player.stats.damageReduction * 100)}%`,
    ].join('  |  '), {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#88ccff',
    }).setScrollFactor(0).setDepth(1001);
    uiElements.push(statsText);

    const closeBtn = this.createButton(width / 2, height / 2 + 240, 'Close', () => {
      destroyAll();
    }).setScrollFactor(0);
    uiElements.push(closeBtn);

    this.isOverlayActive = true;
  }

  private showMessage(message: string): void {
    const { width, height } = this.cameras.main;
    const messageText = this.add.text(width / 2, height - 100, message, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffff00',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setScrollFactor(0);

    this.tweens.add({
      targets: messageText,
      alpha: 0,
      y: height - 150,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => {
        messageText.destroy();
      }
    });
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 140, 30, 0x444466);

    const label = this.add.text(0, 0, text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    container.setSize(140, 30);
    container.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', callback);
    container.setScrollFactor(0).setDepth(1002);
    
    return container;
  }
}
