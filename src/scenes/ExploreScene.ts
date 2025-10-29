import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { DelveGenerator } from '../systems/DelveGenerator';
import { EnemyFactory } from '../systems/EnemyFactory';
import { EquipmentManager } from '../systems/EquipmentManager';
import { GameConfig } from '../config/GameConfig';
import { ItemDatabase } from '../config/ItemDatabase';
import { DiceRoller } from '../utils/DiceRoller';
import { PlayerEquipment } from '../types/GameTypes';

export class ExploreScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private delveMarkers: Phaser.GameObjects.Container[] = [];
  private townPortal!: Phaser.GameObjects.Container;
  private infoText!: Phaser.GameObjects.Text;
  private movementStepCounter: number = 0;
  private encounterCooldown: boolean = false;
  private staminaDebt: number = 0;
  private isOverlayActive: boolean = false;
  private readonly TILE_SIZE: number = 32;
  private readonly WORLD_SIZE: number = 3000;
  private readonly CHUNK_SIZE: number = 800;

  constructor() {
    super('ExploreScene');
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

    this.add.rectangle(0, 0, this.WORLD_SIZE, this.WORLD_SIZE, 0x1a4a2a).setOrigin(0);

    const titleText = this.add.text(width / 2, 20, 'The Wilds of Grawgonia', {
      fontSize: '24px',
      color: '#90ee90',
    }).setOrigin(0.5).setScrollFactor(0);

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

    const menuBtn = this.createButton(width - 120, 20, 'Menu', () => {
      this.openMenu();
    }).setScrollFactor(0);

    this.infoText = this.add.text(20, 60, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 10, y: 5 },
    }).setScrollFactor(0);

    this.add.text(20, height - 40, 'Arrow keys to move • Approach markers to interact', {
      fontSize: '12px',
      color: '#cccccc',
    }).setScrollFactor(0);
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
        if (this.movementStepCounter > 30 && !this.encounterCooldown) {
          this.checkRandomEncounter();
        }
        this.checkDelveProximity();
        this.checkTownPortalProximity();
      }
    }

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
      const tier = Math.floor(Math.random() * 3) + 1;

      const marker = this.createDelveMarker(x, y, tier);
      this.delveMarkers.push(marker);
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
    for (const marker of this.delveMarkers) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        marker.x,
        marker.y
      );

      if (distance < 40) {
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
    if (Math.random() < GameConfig.WORLD.RANDOM_ENCOUNTER_CHANCE) {
      this.movementStepCounter = 0;
      this.encounterCooldown = true;
      this.triggerEncounter();
    }
  }

  private triggerEncounter(): void {
    const encounterType = this.generateRandomEncounter();
    
    const overlay = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      500,
      300,
      0x000000,
      0.9
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    const titleText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 100,
      'Random Encounter!',
      {
        fontSize: '24px',
        color: '#ff8844',
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    const descText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 30,
      encounterType.description,
      {
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 400 },
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    this.isOverlayActive = true;

    if (encounterType.type === 'combat' && encounterType.enemies) {
      const fightBtn = this.createButton(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 80,
        'Fight!',
        () => {
          overlay.destroy();
          titleText.destroy();
          descText.destroy();
          fightBtn.destroy();
          this.isOverlayActive = false;
          this.startWildCombat(encounterType.enemies!);
        }
      ).setScrollFactor(0).setDepth(1002);
    } else if (encounterType.type === 'treasure' && encounterType.loot) {
      const loot = encounterType.loot;
      this.gameState.addArcaneAsh(loot.aa);
      this.gameState.addCrystallineAnimus(loot.ca);
      
      const lootText = this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 40,
        `+${loot.aa} AA, +${loot.ca.toFixed(1)} CA`,
        {
          fontSize: '18px',
          color: '#ffcc00',
        }
      ).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

      this.time.delayedCall(3000, () => {
        overlay.destroy();
        titleText.destroy();
        descText.destroy();
        lootText.destroy();
        this.encounterCooldown = false;
        this.isOverlayActive = false;
      });
    } else {
      this.time.delayedCall(2500, () => {
        overlay.destroy();
        titleText.destroy();
        descText.destroy();
        this.encounterCooldown = false;
        this.isOverlayActive = false;
      });
    }
  }

  private generateRandomEncounter(): any {
    const roll = Math.random();
    
    if (roll < 0.5) {
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
    } else if (roll < 0.75) {
      const aa = Math.floor(Math.random() * 30) + 10;
      const ca = (Math.random() * 2).toFixed(1);
      
      return {
        type: 'treasure',
        description: 'You stumble upon a hidden cache of resources!',
        loot: { aa, ca: parseFloat(ca) },
      };
    } else {
      const events = [
        'You notice strange markings on a nearby tree...',
        'A mysterious fog rolls through, but passes harmlessly.',
        'You hear distant howling, but see nothing.',
        'Ancient ruins peek through the undergrowth.',
      ];
      
      return {
        type: 'event',
        description: events[Math.floor(Math.random() * events.length)],
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

  private updateInfo(): void {
    const player = this.gameState.getPlayer();
    this.infoText.setText([
      `HP: ${player.health}/${player.maxHealth}`,
      `Stamina: ${player.stamina}/${player.maxStamina}`,
      `AA: ${player.arcaneAsh} | CA: ${player.crystallineAnimus.toFixed(1)}`,
    ].join('\n'));
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

  private openMenu(): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 400, 350, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 150, 'Menu', {
      fontSize: '28px',
      color: '#f0a020',
    }).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
    };

    const shortRestBtn = this.createButton(width / 2, height / 2 - 80, 'Short Rest', () => {
      destroyAll();
      this.takeShortRest();
    }).setScrollFactor(0);
    uiElements.push(shortRestBtn);

    const inventoryBtn = this.createButton(width / 2, height / 2 - 30, 'Inventory', () => {
      uiElements.forEach(el => el.destroy());
      this.openInventory();
    }).setScrollFactor(0);
    uiElements.push(inventoryBtn);

    const equipmentBtn = this.createButton(width / 2, height / 2 + 20, 'Equipment', () => {
      uiElements.forEach(el => el.destroy());
      this.openEquipment();
    }).setScrollFactor(0);
    uiElements.push(equipmentBtn);

    const mainMenuBtn = this.createButton(width / 2, height / 2 + 70, 'Return to Main Menu', () => {
      destroyAll();
      this.scene.start('MainMenuScene');
    }).setScrollFactor(0);
    uiElements.push(mainMenuBtn);

    const closeBtn = this.createButton(width / 2, height / 2 + 130, 'Close', () => {
      destroyAll();
    }).setScrollFactor(0);
    uiElements.push(closeBtn);

    this.isOverlayActive = true;
  }

  private openInventory(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 700, 500, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 220, `Inventory (${player.inventory.reduce((sum, item) => sum + item.quantity, 0)}/${player.inventorySlots})`, {
      fontSize: '24px',
      color: '#f0a020',
    }).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.isOverlayActive = false;
    };

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
      }).setScrollFactor(0);
      uiElements.push(itemLabel);

      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (isPotion) {
        const useBtn = this.add.text(width / 2 + 120, y, '[Use]', {
          fontSize: '13px',
          color: '#8888ff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.usePotion(invItem.itemId);
            destroyAll();
            this.openInventory();
          }).setScrollFactor(0);
        uiElements.push(useBtn);
      }

      displayedItems++;
    });

    const closeBtn = this.createButton(width / 2, height / 2 + 220, 'Close', () => {
      destroyAll();
    }).setScrollFactor(0);
    uiElements.push(closeBtn);

    this.isOverlayActive = true;
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
    };

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

      const itemId = player.equipment[slot.key];
      const item = itemId ? ItemDatabase.getItem(itemId) : null;
      const itemName = item ? item.name : 'Empty';

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
      .on('pointerdown', callback);

    const label = this.add.text(0, 0, text, {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5);

    return this.add.container(x, y, [bg, label]);
  }
}
