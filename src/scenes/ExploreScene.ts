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

export class ExploreScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private delveMarkers: Phaser.GameObjects.Container[] = [];
  private townPortal!: Phaser.GameObjects.Container;
  private healthBarFill!: Phaser.GameObjects.Rectangle;
  private healthBarBg!: Phaser.GameObjects.Rectangle;
  private staminaBarFill!: Phaser.GameObjects.Rectangle;
  private staminaBarBg!: Phaser.GameObjects.Rectangle;
  private healthTooltip!: Phaser.GameObjects.Text;
  private staminaTooltip!: Phaser.GameObjects.Text;
  private currencyText!: Phaser.GameObjects.Text;
  private movementStepCounter: number = 0;
  private encounterCooldown: boolean = false;
  private staminaDebt: number = 0;
  private isOverlayActive: boolean = false;
  private readonly TILE_SIZE: number = 32;
  private readonly WORLD_SIZE: number = 3000;
  private readonly CHUNK_SIZE: number = 800;
  private menuState: 'none' | 'main' | 'inventory' | 'equipment' | 'quit' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;
  private terrainContainer!: Phaser.GameObjects.Container;
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
    this.load.image('tree4', '/assets/terrain/tree4.png');
    this.load.image('gemforge-logo', '/assets/ui/gemforge-logo.png');
  }

  init(data?: { returnToLocation?: { x: number; y: number } }) {
    if (data?.returnToLocation) {
      this.registry.set('returnToLocation', data.returnToLocation);
    }
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('explore');

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, this.WORLD_SIZE, this.WORLD_SIZE, 0x000000).setOrigin(0);

    this.terrainContainer = this.add.container(0, 0);
    
    this.unexploredGraphics = this.add.graphics();
    this.unexploredGraphics.setDepth(5);
    
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

    this.cameras.main.setBounds(0, 0, this.WORLD_SIZE, this.WORLD_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.generateInitialWorld();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    
    this.escKey.on('down', () => {
      this.handleEscapeKey();
    });

    const menuBtn = this.createButton(width - 120, 20, 'Menu', () => {
      this.openMenu();
    }).setScrollFactor(0).setDepth(100);

    this.createHealthAndStaminaBars();

    this.add.text(20, height - 40, 'Arrow keys to move • Approach markers to interact', {
      fontSize: '12px',
      color: '#cccccc',
    }).setScrollFactor(0).setDepth(100);
  }

  private drainStaminaForMovement(pixelsMoved: number): void {
    const tilesMoved = pixelsMoved / this.TILE_SIZE;
    this.staminaDebt += tilesMoved * GameConfig.STAMINA.MOVEMENT_DRAIN_RATE;

    if (this.staminaDebt >= 1) {
      const staminaToDrain = Math.floor(this.staminaDebt);
      this.staminaDebt -= staminaToDrain;

      const player = this.gameState.getPlayer();
      player.stamina = Math.max(0, player.stamina - staminaToDrain);
      this.gameState.updatePlayer(player);
    }
  }

  update() {
    const playerData = this.gameState.getPlayer();
    const speed = 3;
    let pixelsMoved = 0;

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
        this.checkTownPortalProximity();
      }
    }

    this.markNearbyTilesExplored();
    this.updateFogOfWar();
    this.updateInfo();
  }

  private generateInitialWorld(): void {
    this.generateDelves();
    this.createTownPortal();
  }

  private generateDelves(): void {
    for (let i = 0; i < 8; i++) {
      const x = 200 + Math.random() * (this.WORLD_SIZE - 400);
      const y = 200 + Math.random() * (this.WORLD_SIZE - 400);
      const tier = 1; // Only Tier 1 delves in current area

      // Don't create markers for completed delves
      if (!this.gameState.isDelveCompleted(x, y)) {
        const marker = this.createDelveMarker(x, y, tier);
        this.delveMarkers.push(marker);
      }
    }
  }

  private createTownPortal(): void {
    const x = this.WORLD_SIZE / 2 + 150;
    const y = this.WORLD_SIZE / 2;

    const portal = this.add.circle(0, 0, 20, 0x4488ff, 0.7);
    const glow = this.add.circle(0, 0, 24, 0x88ccff, 0.3);
    const label = this.add.text(0, -40, 'Town Portal', {
      fontSize: '12px',
      color: '#88ccff',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: glow,
      scale: 1.4,
      alpha: 0.1,
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });

    this.townPortal = this.add.container(x, y, [glow, portal, label]);
  }

  private createDelveMarker(x: number, y: number, tier: number): Phaser.GameObjects.Container {
    const icon = this.add.rectangle(0, 0, 24, 24, 0x8b0000);
    const glow = this.add.circle(0, 0, 16, 0xff0000, 0.3);
    const label = this.add.text(0, -30, `Delve T${tier}`, {
      fontSize: '12px',
      color: '#ff6666',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: glow,
      scale: 1.3,
      alpha: 0.1,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });

    const container = this.add.container(x, y, [glow, icon, label]);
    container.setData('tier', tier);
    
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

      if (distance < 40) {
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

  private enterDelve(tier: number, x: number, y: number): void {
    const generator = new DelveGenerator();
    const delve = generator.generateDelve(tier);
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
      
      const treeVariation = this.getTreeVariation(x, y);
      const tree = this.add.sprite(x + 16, y + 16, `tree${treeVariation}`);
      tree.setScale(0.08);
      tree.setOrigin(0.5, 0.5);
      
      this.terrainContainer.add([grass, tree]);
    }
  }

  private getTreeVariation(x: number, y: number): number {
    const hash = ((x * 374761393) + (y * 668265263)) & 0x7FFFFFFF;
    return (hash % 4) + 1;
  }

  private triggerEncounter(): void {
    const encounterType = this.generateRandomEncounter();
    this.isOverlayActive = true;

    if (encounterType.type === 'combat') {
      this.handleCombatEncounter(encounterType);
    } else if (encounterType.type === 'treasure') {
      this.handleTreasureEncounter(encounterType);
    } else if (encounterType.type === 'shrine') {
      this.handleShrineEncounter(encounterType);
    } else if (encounterType.type === 'void_corruption') {
      this.handleVoidCorruptionEncounter(encounterType);
    } else if (encounterType.type === 'trapped_chest') {
      this.handleTrappedChestEncounter(encounterType);
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
      fontSize: '24px', color: '#ff8844',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 30, encounterType.description, {
      fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 400 },
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
      fontSize: '24px', color: '#ffcc00',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 30, encounterType.description, {
      fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 400 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    const loot = encounterType.loot;
    this.gameState.addArcaneAsh(loot.aa);
    this.gameState.addCrystallineAnimus(loot.ca);

    const lootText = this.add.text(width / 2, height / 2 + 40, `+${loot.aa} AA, +${loot.ca.toFixed(1)} CA`, {
      fontSize: '18px', color: '#ffcc00',
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

    const overlay = this.add.rectangle(width / 2, height / 2, 500, 350, 0x2a0a2a, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 130, 'Shrine to the Faceless Old God', {
      fontSize: '24px', color: '#aa44ff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 70, encounterType.description, {
      fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 450 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const choiceText = this.add.text(width / 2, height / 2, 'Offer 50 Arcane Ash?', {
      fontSize: '18px', color: '#ffcc88',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText, choiceText);

    const yesBtnBg = this.add.rectangle(width / 2 - 70, height / 2 + 60, 140, 30, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
      if (player.arcaneAsh < 50) {
        choiceText.setText('Not enough Arcane Ash!').setColor('#ff4444');
        this.time.delayedCall(2000, () => {
          uiElements.forEach(el => el.destroy());
          yesBtnBg.destroy();
          yesBtnLabel.destroy();
          noBtnBg.destroy();
          noBtnLabel.destroy();
          this.encounterCooldown = false;
          this.isOverlayActive = false;
        });
        return;
      }

      this.gameState.addArcaneAsh(-50);
      yesBtnBg.destroy();
      yesBtnLabel.destroy();
      noBtnBg.destroy();
      noBtnLabel.destroy();

      const roll = Math.random();
      if (roll < 0.70) {
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

        choiceText.setText(outcomeMessage).setColor('#44ff44');
        this.time.delayedCall(3500, () => {
          uiElements.forEach(el => el.destroy());
          this.encounterCooldown = false;
          this.isOverlayActive = false;
        });
      }
    });

    const yesBtnLabel = this.add.text(width / 2 - 70, height / 2 + 60, 'Offer (50 AA)', {
      fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);

    const noBtnBg = this.add.rectangle(width / 2 + 70, height / 2 + 60, 140, 30, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        uiElements.forEach(el => el.destroy());
        yesBtnBg.destroy();
        yesBtnLabel.destroy();
        noBtnBg.destroy();
        noBtnLabel.destroy();
        this.encounterCooldown = false;
        this.isOverlayActive = false;
      });

    const noBtnLabel = this.add.text(width / 2 + 70, height / 2 + 60, 'Decline', {
      fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);
  }

  private handleVoidCorruptionEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, 500, 350, 0x1a0a2a, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 130, 'Void Corruption Pocket', {
      fontSize: '24px', color: '#8844ff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 70, encounterType.description, {
      fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 450 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const choiceText = this.add.text(width / 2, height / 2, 'Enter the corruption?\nFace an elite enemy for 2x loot!', {
      fontSize: '16px', color: '#ffcc88', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText, choiceText);

    const enterBtnBg = this.add.rectangle(width / 2 - 70, height / 2 + 70, 140, 30, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        uiElements.forEach(el => el.destroy());
        enterBtnBg.destroy();
        enterBtnLabel.destroy();
        fleeBtnBg.destroy();
        fleeBtnLabel.destroy();
        this.isOverlayActive = false;

        const eliteEnemy = EnemyFactory.createEnemy(2, false);
        eliteEnemy.lootTable.forEach(item => item.dropChance *= 2);
        this.startWildCombat([eliteEnemy]);
      });

    const enterBtnLabel = this.add.text(width / 2 - 70, height / 2 + 70, 'Enter', {
      fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);

    const fleeBtnBg = this.add.rectangle(width / 2 + 70, height / 2 + 70, 140, 30, 0x444466)
      .setScrollFactor(0).setDepth(1002)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        uiElements.forEach(el => el.destroy());
        enterBtnBg.destroy();
        enterBtnLabel.destroy();
        fleeBtnBg.destroy();
        fleeBtnLabel.destroy();
        this.encounterCooldown = false;
        this.isOverlayActive = false;
      });

    const fleeBtnLabel = this.add.text(width / 2 + 70, height / 2 + 70, 'Flee', {
      fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);
  }

  private handleTrappedChestEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();

    const overlay = this.add.rectangle(width / 2, height / 2, 500, 300, 0x2a1a0a, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 100, 'Trapped Chest!', {
      fontSize: '24px', color: '#ff8844',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 50, encounterType.description + '\nAttempting to open...', {
      fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 450 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText);

    this.time.delayedCall(1500, () => {
      const skillCheck = Math.random();
      
      if (skillCheck < 0.60) {
        const aa = Math.floor(Math.random() * 41) + 40;
        const ca = (Math.random() * 3) + 3;
        
        this.gameState.addArcaneAsh(aa);
        this.gameState.addCrystallineAnimus(ca);

        const resultText = this.add.text(width / 2, height / 2 + 20, 
          `Success! Disarmed the trap!\n+${aa} AA, +${ca.toFixed(1)} CA`, {
          fontSize: '18px', color: '#44ff44', align: 'center',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
        uiElements.push(resultText);
      } else {
        const damage = Math.floor(Math.random() * 11) + 15;
        player.health = Math.max(0, player.health - damage);
        this.gameState.updatePlayer(player);

        const resultText = this.add.text(width / 2, height / 2 + 20, 
          `Failed! The trap triggers!\nTook ${damage} damage!`, {
          fontSize: '18px', color: '#ff4444', align: 'center',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
        uiElements.push(resultText);
      }

      this.time.delayedCall(3000, () => {
        uiElements.forEach(el => el.destroy());
        this.encounterCooldown = false;
        this.isOverlayActive = false;
      });
    });
  }

  private handleWanderingMerchantEncounter(encounterType: any): void {
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, 600, 450, 0x1a1a2a, 0.95)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    const titleText = this.add.text(width / 2, height / 2 - 200, 'Wandering Merchant', {
      fontSize: '24px', color: '#ffaa44',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    const descText = this.add.text(width / 2, height / 2 - 160, encounterType.description, {
      fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 550 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    uiElements.push(overlay, titleText, descText);

    const allItems = ShopData.getAllShopItems();
    const randomItems = [];
    for (let i = 0; i < 5; i++) {
      randomItems.push(allItems[Math.floor(Math.random() * allItems.length)]);
    }

    let yPos = height / 2 - 110;
    randomItems.forEach((shopItem, index) => {
      const itemData = ItemDatabase.getItem(shopItem.itemId);
      const price = Math.floor(shopItem.price * 1.5);
      
      const itemText = this.add.text(width / 2 - 220, yPos, 
        `${itemData?.name || shopItem.itemId} - ${price} ${shopItem.currency}`, {
        fontSize: '14px', color: '#ffffff',
      }).setScrollFactor(0).setDepth(1001);
      
      const buyBtn = this.createButton(width / 2 + 150, yPos, 'Buy', () => {
        const player = this.gameState.getPlayer();
        const canAfford = shopItem.currency === 'AA' 
          ? player.arcaneAsh >= price 
          : player.crystallineAnimus >= price;

        if (!canAfford) {
          itemText.setColor('#ff4444');
          this.time.delayedCall(500, () => itemText.setColor('#ffffff'));
          return;
        }

        if (shopItem.currency === 'AA') {
          this.gameState.addArcaneAsh(-price);
        } else {
          this.gameState.addCrystallineAnimus(-price);
        }

        player.inventory.push({ itemId: shopItem.itemId, quantity: 1 });
        this.gameState.updatePlayer(player);
        
        itemText.setColor('#44ff44').setText(`${itemData?.name || shopItem.itemId} - PURCHASED`);
        buyBtn.setVisible(false);
      }).setScrollFactor(0).setDepth(1002);

      uiElements.push(itemText, buyBtn);
      yPos += 50;
    });

    const closeBtn = this.createButton(width / 2, height / 2 + 180, 'Leave', () => {
      uiElements.forEach(el => el.destroy());
      closeBtn.destroy();
      this.encounterCooldown = false;
      this.isOverlayActive = false;
    }).setScrollFactor(0).setDepth(1002);
  }

  private generateRandomEncounter(): any {
    const roll = Math.random();
    
    if (roll < 0.40) {
      const numEnemies = Math.floor(Math.random() * 2) + 1;
      const enemies = [];
      for (let i = 0; i < numEnemies; i++) {
        enemies.push(EnemyFactory.createWildEnemy());
      }
      
      return {
        type: 'combat',
        description: `You've been ambushed by ${numEnemies} ${enemies[0].name}${numEnemies > 1 ? 's' : ''}!`,
        enemies,
      };
    } else if (roll < 0.60) {
      const aa = Math.floor(Math.random() * 41) + 40;
      const ca = (Math.random() * 3) + 3;
      
      return {
        type: 'treasure',
        description: 'You stumble upon a hidden cache of resources!',
        loot: { aa, ca: parseFloat(ca.toFixed(1)) },
      };
    } else if (roll < 0.75) {
      return {
        type: 'shrine',
        description: 'You discover a shrine to the Faceless Old God...\nCorrupted whispers promise power for the faithful.',
      };
    } else if (roll < 0.85) {
      return {
        type: 'void_corruption',
        description: 'A pocket of void corruption pulses before you.\nDangerous... but potentially rewarding.',
      };
    } else if (roll < 0.95) {
      return {
        type: 'trapped_chest',
        description: 'You spot an ornate chest partially buried in the earth.',
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
        fontSize: '24px',
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

  private createHealthAndStaminaBars(): void {
    const barWidth = 300;
    const barHeight = 30;
    const startX = 20;
    const startY = 60;

    // Health Bar
    this.add.text(startX, startY - 20, 'Health', {
      fontSize: '16px',
      color: '#ffffff',
    }).setScrollFactor(0).setDepth(100);

    this.healthBarBg = this.add.rectangle(startX, startY, barWidth, barHeight, 0x330000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive();

    this.healthBarFill = this.add.rectangle(startX + 2, startY + 2, barWidth - 4, barHeight - 4, 0xff0000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);

    this.healthTooltip = this.add.text(startX + barWidth / 2, startY + barHeight / 2, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setVisible(false);

    // Stamina Bar
    this.add.text(startX, startY + barHeight + 30, 'Stamina', {
      fontSize: '16px',
      color: '#ffffff',
    }).setScrollFactor(0).setDepth(100);

    this.staminaBarBg = this.add.rectangle(startX, startY + barHeight + 50, barWidth, barHeight, 0x333300)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive();

    this.staminaBarFill = this.add.rectangle(startX + 2, startY + barHeight + 52, barWidth - 4, barHeight - 4, 0xffff00)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);

    this.staminaTooltip = this.add.text(startX + barWidth / 2, startY + barHeight + 50 + barHeight / 2, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setVisible(false);

    // Currency text
    this.currencyText = this.add.text(startX, startY + barHeight * 2 + 80, '', {
      fontSize: '16px',
      color: '#f0a020',
      backgroundColor: '#00000088',
      padding: { x: 10, y: 5 },
    }).setScrollFactor(0).setDepth(100);

    // Hover events
    this.healthBarBg.on('pointerover', () => {
      this.healthTooltip.setVisible(true);
    });
    this.healthBarBg.on('pointerout', () => {
      this.healthTooltip.setVisible(false);
    });

    this.staminaBarBg.on('pointerover', () => {
      this.staminaTooltip.setVisible(true);
    });
    this.staminaBarBg.on('pointerout', () => {
      this.staminaTooltip.setVisible(false);
    });
  }

  private updateInfo(): void {
    const player = this.gameState.getPlayer();
    const healthPercent = player.health / player.maxHealth;
    const staminaPercent = player.stamina / player.maxStamina;
    
    // Update bar widths
    const maxBarWidth = 296;
    this.healthBarFill.width = Math.max(0, maxBarWidth * healthPercent);
    this.staminaBarFill.width = Math.max(0, maxBarWidth * staminaPercent);

    // Update tooltips
    this.healthTooltip.setText(`${player.health} / ${player.maxHealth} HP`);
    this.staminaTooltip.setText(`${player.stamina} / ${player.maxStamina} Stamina`);

    // Update currency
    this.currencyText.setText(`AA: ${player.arcaneAsh} | CA: ${player.crystallineAnimus.toFixed(1)}`);

    // Pulsing effect when below 15%
    if (healthPercent < 0.15) {
      if (!this.tweens.getTweensOf(this.healthBarFill).length) {
        this.tweens.add({
          targets: this.healthBarFill,
          alpha: 0.3,
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
      }
    } else {
      this.tweens.killTweensOf(this.healthBarFill);
      this.healthBarFill.setAlpha(1);
    }

    if (staminaPercent < 0.15) {
      if (!this.tweens.getTweensOf(this.staminaBarFill).length) {
        this.tweens.add({
          targets: this.staminaBarFill,
          alpha: 0.3,
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
      }
    } else {
      this.tweens.killTweensOf(this.staminaBarFill);
      this.staminaBarFill.setAlpha(1);
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
      SceneManager.getInstance().transitionTo('town');
    }
  }

  private handleEscapeKey(): void {
    if (this.menuState === 'inventory' || this.menuState === 'equipment') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
      this.openMenu();
    } else if (this.menuState === 'main') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    } else if (this.menuState === 'quit') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    } else {
      this.openQuitMenu();
    }
  }

  private openMenu(): void {
    if (this.isOverlayActive) return;
    this.isOverlayActive = true;
    
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 400, 350, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 150, 'Menu', {
      fontSize: '28px',
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

    const shortRestBtn = this.createButton(width / 2, height / 2 - 80, 'Short Rest', () => {
      destroyAll();
      this.takeShortRest();
    }).setScrollFactor(0).setDepth(1002);
    uiElements.push(shortRestBtn);

    const inventoryBtn = this.createButton(width / 2, height / 2 - 30, 'Inventory', () => {
      uiElements.forEach(el => el.destroy());
      this.openInventory();
    }).setScrollFactor(0).setDepth(1002);
    uiElements.push(inventoryBtn);

    const equipmentBtn = this.createButton(width / 2, height / 2 + 20, 'Equipment', () => {
      uiElements.forEach(el => el.destroy());
      this.openEquipment();
    }).setScrollFactor(0).setDepth(1002);
    uiElements.push(equipmentBtn);

    const mainMenuBtn = this.createButton(width / 2, height / 2 + 70, 'Return to Main Menu', () => {
      destroyAll();
      this.scene.start('MainMenuScene');
    }).setScrollFactor(0).setDepth(1002);
    uiElements.push(mainMenuBtn);

    const closeBtn = this.createButton(width / 2, height / 2 + 130, 'Close', () => {
      destroyAll();
    }).setScrollFactor(0).setDepth(1002);
    uiElements.push(closeBtn);

    this.isOverlayActive = true;
  }

  private openQuitMenu(): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 400, 250, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 100, 'Quit Game?', {
      fontSize: '28px',
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

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setInteractive().setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 700, 500, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 220, `Inventory (${player.inventory.reduce((sum, item) => sum + item.quantity, 0)}/${player.inventorySlots})`, {
      fontSize: '24px',
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
        fontSize: '14px',
        color: '#ffffff',
      }).setScrollFactor(0).setDepth(1001);
      uiElements.push(itemLabel);

      const weapon = ItemDatabase.getWeapon(invItem.itemId);
      const armor = ItemDatabase.getArmor(invItem.itemId);
      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (weapon) {
        if (weapon.twoHanded) {
          const equipBtn = this.add.text(width / 2 + 70, y, '[Equip]', {
            fontSize: '12px',
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
            fontSize: '11px',
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            }).setScrollFactor(0).setDepth(1002);
          uiElements.push(equipMHBtn);

          const equipOHBtn = this.add.text(width / 2 + 115, y, '[Equip OH]', {
            fontSize: '11px',
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
          fontSize: '12px',
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
          fontSize: '12px',
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
      player.health = Math.min(player.maxHealth, player.health + amount);
      this.showMessage(`Used ${potion.name}! Restored ${amount} HP`);
    } else if (potion.type === 'stamina') {
      player.stamina = Math.min(player.maxStamina, player.stamina + amount);
      this.showMessage(`Used ${potion.name}! Restored ${amount} Stamina`);
    }

    this.gameState.removeItemFromInventory(itemId, 1);
    this.gameState.updatePlayer(player);
  }

  private openEquipment(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 700, 550, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 250, 'Equipment', {
      fontSize: '24px',
      color: '#f0a020',
    }).setOrigin(0.5).setScrollFactor(0);
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
        fontSize: '14px',
        color: '#aaaaaa',
      }).setScrollFactor(0);
      uiElements.push(slotLabel);

      const equipped = player.equipment[slot.key];
      const item = equipped ? ItemDatabase.getItem(equipped.itemId) : null;
      const itemName = equipped ? ForgingSystem.getItemDisplayName({ itemId: equipped.itemId, quantity: 1, enhancementLevel: equipped.enhancementLevel }) : 'Empty';

      const itemLabel = this.add.text(width / 2 - 200, y, itemName, {
        fontSize: '14px',
        color: item ? '#ffffff' : '#666666',
      }).setScrollFactor(0);
      uiElements.push(itemLabel);
    });

    const statsTitle = this.add.text(width / 2 - 320, height / 2 + 100, 'Stats:', {
      fontSize: '16px',
      color: '#ffaa00',
    }).setScrollFactor(0);
    uiElements.push(statsTitle);

    const statsText = this.add.text(width / 2 - 320, height / 2 + 130, [
      `Evasion: ${player.stats.calculatedEvasion}`,
      `Damage Reduction: ${Math.floor(player.stats.damageReduction * 100)}%`,
    ].join('  |  '), {
      fontSize: '14px',
      color: '#88ccff',
    }).setScrollFactor(0);
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
      fontSize: '16px',
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
    const bg = this.add.rectangle(0, 0, 140, 30, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', callback)
      .setDepth(1002);

    const label = this.add.text(0, 0, text, {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(1002);

    const container = this.add.container(x, y, [bg, label]);
    container.setScrollFactor(0).setDepth(1002);
    
    return container;
  }
}
