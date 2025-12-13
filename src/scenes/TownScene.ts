import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { ItemDatabase } from '../config/ItemDatabase';
import { EquipmentManager } from '../systems/EquipmentManager';
import { DiceRoller } from '../utils/DiceRoller';
import { PlayerEquipment, InventoryItem, PlayerData } from '../types/GameTypes';
import { ShopData } from '../config/ShopData';
import { BuffManager } from '../systems/BuffManager';
import { ForgingSystem } from '../systems/ForgingSystem';
import { CurrencyDisplay } from '../utils/CurrencyDisplay';
import { FONTS } from '../config/fonts';
import { ItemColorUtil } from '../utils/ItemColorUtil';
import { ItemSprites } from '../config/ItemSprites';
import { ApiClient } from '../utils/ApiClient';
import { GameConfig } from '../config/GameConfig';
import { AudioManager } from '../managers/AudioManager';
import { StatsPanel } from '../ui/StatsPanel';
import { TerrainGenerator } from '../utils/TerrainGenerator';
import { WELCOME_MESSAGE } from '../config/StarterKit';
import { ItemTooltip } from '../utils/ItemTooltip';
import { ZONES, getUnlockableZones, isZoneUnlockable, getDelveProgress, ZoneConfig } from '../../shared/zoneConfig';

export class TownScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private statsPanel!: StatsPanel;
  private menuState: 'none' | 'inventory' | 'equipment' | 'shop' | 'forge' | 'inn' | 'footlocker' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;
  private itemTooltip: ItemTooltip | null = null;
  private footlockerScrollPosition: { footlocker: number; inventory: number } = { footlocker: 0, inventory: 0 };

  constructor() {
    super('TownScene');
  }

  preload() {
    this.load.image('coin-aa', '/assets/ui/currency/arcane-ash-coin.png');
    this.load.image('coin-ca', '/assets/ui/currency/crystalline-animus-coin.png');
    this.load.image('equipment-panel', '/assets/ui/equipment-panel.png');
    this.load.image('blacksmith-button', '/assets/ui/shop-buttons/blacksmith-button.png');
    this.load.image('merchant-icon', '/assets/npcs/merchant-icon.png');
    this.load.image('innkeeper-icon', '/assets/npcs/innkeeper-icon.png');
    this.load.image('gem-expert-icon', '/assets/npcs/gem-expert-icon.png');
    this.load.image('marketplace-icon', '/assets/npcs/marketplace-icon.png');
    this.load.image('vault-keeper-icon', '/assets/npcs/vault-keeper-icon.png');
    this.load.image('keeper-of-virtue-icon', '/assets/npcs/keeper-of-virtue-icon.png');
    this.load.image('mage-tower-icon', '/assets/npcs/mage-tower-icon.png');
    this.load.image('garthek-button', '/assets/ui/shop-buttons/garthek-button.png');
    this.load.image('evasion-icon', '/assets/ui/evasion-icon.png');
    this.load.image('shield-icon', '/assets/ui/shield-icon.png');
    this.load.image('venture-forth-button', '/assets/ui/venture-forth-button.png');
    this.load.audio('town-music', '/assets/audio/town-music.mp3');
    
    const itemSprites = ItemSprites.getAllSpritePaths();
    itemSprites.forEach(({ itemId, path }) => {
      this.load.image(itemId, path);
    });
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('town');
    
    let player = this.gameState.getPlayer();
    BuffManager.clearTownBuffs(player);
    player.wildernessRestsRemaining = GameConfig.STAMINA.MAX_WILDERNESS_RESTS;
    player.lastRestTimestamp = 0;  // Reset cooldown when entering town
    this.gameState.updatePlayer(player);
    
    // Always clear explored tiles when entering town - each expedition starts with fresh fog of war
    this.gameState.clearExploredTiles();
    
    // Check if this is a fresh expedition (death/respawn/new game) for delve regeneration
    const sceneData = this.scene.settings.data as any;
    const isFreshExpedition = sceneData?.freshExpedition === true;
    
    if (isFreshExpedition) {
      // Clear discovered delves so they regenerate on next wilderness visit
      const state = this.gameState.getState();
      state.discoveredDelves = [];
      TerrainGenerator.clearDelvePositions();
    }
    // NOTE: Delve positions are preserved when simply returning to town,
    // but fog of war always resets for each new expedition

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x2a2a3e).setOrigin(0);

    this.add.text(width / 2, 60, 'Gemforge Chronicles', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,  // Reduced from xlarge for better balance
      color: '#f0a020',
      fontStyle: 'bold',
      resolution: 2,
    }).setOrigin(0.5);

    this.add.text(width / 2, 110, 'ROBOKA - City of Steel', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,  // Reduced from medium for better balance
      color: '#cccccc',
      resolution: 2,
    }).setOrigin(0.5);
    
    // Create stats panel
    this.statsPanel = new StatsPanel(this, 20, 40);
    this.statsPanel.update(player);
    
    // Initialize item tooltip
    this.itemTooltip = new ItemTooltip(this);

    this.createNPCs();

    const ventureForthBtn = this.add.image(width / 2, height - 100, 'venture-forth-button')
      .setScale(0.35)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => ventureForthBtn.setTint(0xcccccc))
      .on('pointerout', () => ventureForthBtn.clearTint())
      .on('pointerdown', () => {
        const WORLD_SIZE = 6000;
        const robokaX = WORLD_SIZE / 2 + 100;
        const robokaY = WORLD_SIZE / 2;
        SceneManager.getInstance().transitionTo('explore', { 
          returnToLocation: { x: robokaX, y: robokaY } 
        });
      });

    this.createButton(width - 120, height - 100, 'Inventory', () => {
      this.openInventory();
    });

    this.createButton(width - 120, height - 150, 'Equipment', () => {
      this.openEquipment();
    });

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    
    this.escKey.on('down', () => {
      this.handleEscapeKey();
    });

    // Play town music
    const audioManager = AudioManager.getInstance();
    audioManager.playMusic(this, 'town-music', true);

    // Check for looted tombstones and prompt for karma return
    this.checkKarmaPrompt();

    // Check if this is a new player who should see the welcome message
    if (player.isNewPlayer) {
      this.showWelcomeTooltip();
    }
  }

  private handleEscapeKey(): void {
    if (this.currentMenuCloseFunction) {
      this.currentMenuCloseFunction();
    } else {
      // No menu open, open ESC menu
      this.scene.launch('EscMenuScene', { parentKey: this.scene.key });
      this.scene.pause();
    }
  }

  private showWelcomeTooltip(): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0).setDepth(3000);
    uiElements.push(overlay);

    const panelWidth = 550;
    const panelHeight = 280;
    const panel = this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x1a1a2e, 1)
      .setOrigin(0.5).setDepth(3001).setStrokeStyle(3, 0xf0a020);
    uiElements.push(panel);

    const title = this.add.text(width / 2, height / 2 - 100, 'Welcome to Roboka!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#f0a020',
      fontStyle: 'bold',
      resolution: 2,
    }).setOrigin(0.5).setDepth(3002);
    uiElements.push(title);

    const message = this.add.text(width / 2, height / 2, WELCOME_MESSAGE.text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#cccccc',
      wordWrap: { width: panelWidth - 60 },
      align: 'center',
      resolution: 2,
      lineSpacing: 6,
    }).setOrigin(0.5).setDepth(3002);
    uiElements.push(message);

    const signature = this.add.text(width / 2, height / 2 + 70, `- ${WELCOME_MESSAGE.signature}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#88aaff',
      fontStyle: 'italic',
      resolution: 2,
    }).setOrigin(0.5).setDepth(3002);
    uiElements.push(signature);

    const buttonWidth = 120;
    const buttonHeight = 36;
    const buttonY = height / 2 + 110;

    const okayBtn = this.add.rectangle(width / 2, buttonY, buttonWidth, buttonHeight, 0x4488ff)
      .setInteractive({ useHandCursor: true }).setDepth(3002);
    uiElements.push(okayBtn);

    const okayText = this.add.text(width / 2, buttonY, 'Okay', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0.5).setDepth(3003);
    uiElements.push(okayText);

    okayBtn.on('pointerover', () => okayBtn.setFillStyle(0x5599ff));
    okayBtn.on('pointerout', () => okayBtn.setFillStyle(0x4488ff));
    okayBtn.on('pointerdown', () => {
      uiElements.forEach(el => el.destroy());
      
      const player = this.gameState.getPlayer();
      player.isNewPlayer = false;
      this.gameState.updatePlayer(player);
      this.gameState.saveToServer();
    });

    this.time.delayedCall(WELCOME_MESSAGE.displayDurationMs, () => {
      const stillExists = uiElements.some(el => el.active);
      if (stillExists) {
        uiElements.forEach(el => el.destroy());
        
        const player = this.gameState.getPlayer();
        player.isNewPlayer = false;
        this.gameState.updatePlayer(player);
        this.gameState.saveToServer();
      }
    });
  }

  private async checkKarmaPrompt(): Promise<void> {
    try {
      const lootedTombstones = await ApiClient.getLootedTombstones();
      
      // Only show prompt if there are looted tombstones
      if (lootedTombstones.length > 0) {
        this.showKarmaReturnPrompt(lootedTombstones);
      }
    } catch (error) {
      console.error('Failed to check karma status:', error);
    }
  }

  private showKarmaReturnPrompt(tombstones: any[]): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    // Darken the screen
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0).setDepth(2000);
    uiElements.push(overlay);

    // Main panel
    const panel = this.add.rectangle(width / 2, height / 2, 600, 400, 0x1a1a2e, 1)
      .setOrigin(0.5).setDepth(2001);
    uiElements.push(panel);

    // Title
    const title = this.add.text(width / 2, height / 2 - 160, 'Halls of Virtue', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(2002);
    uiElements.push(title);

    // Message
    const totalItems = tombstones.reduce((sum, ts) => sum + (ts.items?.length || 0), 0);
    const message = this.add.text(width / 2, height / 2 - 100, 
      `You have looted ${totalItems} items from ${tombstones.length} fallen adventurer${tombstones.length > 1 ? 's' : ''}.\n\nThe Keeper of Virtue offers you a choice:\n\nReturn the items to their rightful owners\nand earn eternal karma...\n\n...or keep them for yourself.`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
      align: 'center',
      wordWrap: { width: 500 },
      lineSpacing: 4,
    }).setOrigin(0.5).setDepth(2002);
    uiElements.push(message);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    // Return button
    const returnBtn = this.createButton(width / 2 - 120, height / 2 + 140, 'Return Items', async () => {
      destroyAll();
      await this.returnAllLoot(tombstones);
    }).setDepth(2002);
    uiElements.push(returnBtn);

    // Keep button  
    const keepBtn = this.createButton(width / 2 + 120, height / 2 + 140, 'Keep Items', () => {
      destroyAll();
      this.showMessage('You have chosen to keep the looted items.');
    }).setDepth(2002);
    uiElements.push(keepBtn);

    this.menuState = 'none'; // Special state
    this.currentMenuCloseFunction = destroyAll;
  }

  private async returnAllLoot(tombstones: any[]): Promise<void> {
    const player = this.gameState.getPlayer();
    let totalKarma = 0;

    for (const tombstone of tombstones) {
      try {
        // Map database field names (snake_case) to API (camelCase)
        await ApiClient.returnLoot({
          originalOwnerId: tombstone.owner_id || tombstone.ownerId,
          returnerName: 'Player', // TODO: Get actual player name
          items: tombstone.items,
        });
        
        totalKarma += tombstone.items.length;
      } catch (error) {
        console.error('Failed to return loot:', error);
      }
    }

    if (totalKarma > 0) {
      this.showMessage(`Returned ${totalKarma} items! You earned karma points.`);
    }
  }

  private createNPCs(): void {
    const { width } = this.cameras.main;
    const npcY = 240;
    const npcSpacing = 120;  // Increased from 90 to 120 for more horizontal breathing room

    const npcs = [
      { name: 'Blacksmith', color: 0xff6633, description: 'Forges and upgrades equipment', sprite: 'blacksmith-button' },
      { name: 'Merchant', color: 0x66cc66, description: 'Buys and sells goods', sprite: 'merchant-icon' },
      { name: 'Innkeeper', color: 0x6699ff, description: 'Provides rest and healing', sprite: 'innkeeper-icon' },
      { name: 'Vault Keeper', color: 0x88ddff, description: 'Manages your storage footlocker', sprite: 'vault-keeper-icon' },
      { name: 'Garthek', color: 0x9944cc, description: 'The Stitcher - Binds items to your soul', sprite: 'garthek-button' },
      { name: 'Keeper of Virtue', color: 0xffd700, description: 'Reclaim returned items and view karma', sprite: 'keeper-of-virtue-icon' },
      { name: 'Mage Tower', color: 0x6644aa, description: 'Warp to discovered zones', sprite: 'mage-tower-icon' },
      { name: 'Gem Expert', color: 0xcc66ff, description: 'Soulbinds Voidtouched Gems', sprite: 'gem-expert-icon' },
      { name: 'Marketplace', color: 0xff9966, description: 'Player trading hub', sprite: 'marketplace-icon' },
    ];

    const columns = 3;
    const startX = width / 2 - (columns - 1) * npcSpacing;

    npcs.forEach((npc, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = startX + col * (npcSpacing * 2);
      const y = npcY + row * 145;  // Increased from 100 to 145 for 120px avatars + label spacing

      let npcVisual: Phaser.GameObjects.GameObject;

      // Check if sprite is defined AND texture actually exists in Phaser's cache
      const hasValidSprite = npc.sprite && this.textures.exists(npc.sprite);
      
      if (hasValidSprite) {
        const npcSprite = this.add.image(x, y, npc.sprite!)
          .setDisplaySize(120, 120)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', () => npcSprite.setTint(0xdddddd))
          .on('pointerout', () => npcSprite.clearTint())
          .on('pointerdown', () => this.interactWithNPC(npc.name, npc.description));
        npcVisual = npcSprite;
      } else {
        const npcBox = this.add.rectangle(x, y, 120, 120, npc.color)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', () => npcBox.setFillStyle(npc.color, 0.7))
          .on('pointerout', () => npcBox.setFillStyle(npc.color, 1))
          .on('pointerdown', () => this.interactWithNPC(npc.name, npc.description));
        npcVisual = npcBox;
      }

      this.add.text(x, y + 72, npc.name, {  // Increased spacing from 60 to 72 for breathing room
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
      }).setOrigin(0.5);
    });
  }

  private interactWithNPC(name: string, description: string): void {
    // Don't allow opening a new menu if one is already open
    if (this.menuState !== 'none') {
      return;
    }

    if (name === 'Merchant') {
      this.openShop();
      return;
    }

    if (name === 'Blacksmith') {
      this.openForge();
      return;
    }

    if (name === 'Innkeeper') {
      this.openInn();
      return;
    }

    if (name === 'Vault Keeper') {
      this.footlockerScrollPosition = { footlocker: 0, inventory: 0 };
      this.openFootlocker();
      return;
    }

    if (name === 'Garthek') {
      this.openSoulbinding();
      return;
    }

    if (name === 'Keeper of Virtue') {
      this.openHallsOfVirtue();
      return;
    }

    if (name === 'Mage Tower') {
      this.openMageWarpNexus();
      return;
    }

    const msg = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      `${name}\n\n${description}\n\n[Coming Soon]`,
      {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 30, y: 20 },
        align: 'center',
      }
    ).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: msg,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 2000,
      onComplete: () => msg.destroy(),
    });
  }

  private updatePlayerDisplay(): void {
    const player = this.gameState.getPlayer();
    if (this.statsPanel) {
      this.statsPanel.update(player);
    }
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 300, 50, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', callback);

    const label = this.add.text(0, 0, text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    return container;
  }

  private showMessage(message: string): void {
    const msg = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, message, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#00ff00',
      backgroundColor: '#000000',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: msg,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 1500,
      onComplete: () => msg.destroy(),
    });
  }

  private openInventory(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 900, 500, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 220, `Inventory (${player.inventory.reduce((sum, item) => sum + item.quantity, 0)}/${player.inventorySlots})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(title);

    const destroyAll = () => {
      if (this.itemTooltip) {
        this.itemTooltip.hide();
      }
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'inventory';

    const itemsStartY = height / 2 - 180;
    const itemHeight = 28;
    const maxDisplay = 12;

    let displayedItems = 0;
    player.inventory.forEach((invItem, index) => {
      if (displayedItems >= maxDisplay) return;

      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) return;

      const y = itemsStartY + displayedItems * itemHeight;
      
      // Build item label with durability for equipment
      let displayName = item.name;
      if (invItem.enhancementLevel && invItem.enhancementLevel > 0) {
        displayName += ` +${invItem.enhancementLevel}`;
      }
      displayName += ` x${invItem.quantity}`;
      
      const weapon = ItemDatabase.getWeapon(invItem.itemId);
      const armor = ItemDatabase.getArmor(invItem.itemId);
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemLabel = this.add.text(width / 2 - 420, y, displayName, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: itemColor,
        resolution: 2,
      }).setInteractive({ useHandCursor: true })
        .on('pointerover', (pointer: Phaser.Input.Pointer) => {
          if (this.itemTooltip) {
            this.itemTooltip.show(pointer.x, pointer.y, invItem);
          }
        })
        .on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (this.itemTooltip) {
            this.itemTooltip.updatePosition(pointer.x, pointer.y);
          }
        })
        .on('pointerout', () => {
          if (this.itemTooltip) {
            this.itemTooltip.hide();
          }
        });
      uiElements.push(itemLabel);
      
      // Show durability for weapons and armor
      if (weapon || armor) {
        const currentDurability = invItem.durability ?? 100;
        const maxDurability = invItem.maxDurability ?? 100;
        const durabilityPercent = (currentDurability / maxDurability) * 100;
        
        let durabilityColor = '#88ff88';
        if (durabilityPercent <= 0) durabilityColor = '#ff4444';
        else if (durabilityPercent <= 25) durabilityColor = '#ffaa00';
        else if (durabilityPercent <= 50) durabilityColor = '#ffff00';
        
        const durabilityLabel = this.add.text(width / 2 - 130, y, `[${Math.floor(currentDurability)}/${maxDurability}]`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: durabilityColor,
          resolution: 2,
        });
        uiElements.push(durabilityLabel);
      }

      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (weapon) {
        if (weapon.twoHanded) {
          const equipBtn = this.add.text(width / 2 + 150, y, '[Equip]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.xsmall,
            color: '#88ff88',
            resolution: 2,
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            });
          uiElements.push(equipBtn);
        } else {
          const equipMHBtn = this.add.text(width / 2 + 150, y, '[Equip MH]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.xsmall,
            color: '#88ff88',
            resolution: 2,
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            });
          uiElements.push(equipMHBtn);

          const equipOHBtn = this.add.text(width / 2 + 260, y, '[Equip OH]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.xsmall,
            color: '#88ff88',
            resolution: 2,
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'offHand');
              destroyAll();
              this.openInventory();
            });
          uiElements.push(equipOHBtn);
        }
      } else if (armor) {
        const equipBtn = this.add.text(width / 2 + 150, y, '[Equip]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#88ff88',
          resolution: 2,
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.equipItemFromInventory(invItem.itemId);
            destroyAll();
            this.openInventory();
          });
        uiElements.push(equipBtn);
      }

      if (isPotion) {
        const useBtn = this.add.text(width / 2 + 150, y, '[Use]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#8888ff',
          resolution: 2,
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.usePotion(invItem.itemId);
            destroyAll();
            this.openInventory();
          });
        uiElements.push(useBtn);
      }

      const storeBtn = this.add.text(width / 2 + 360, y, '[Store]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#ffaa88',
        resolution: 2,
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.storeItem(invItem.itemId);
          destroyAll();
          this.openInventory();
        });
      uiElements.push(storeBtn);

      displayedItems++;
    });

    const closeBtn = this.createButton(width / 2, height / 2 + 220, 'Close', () => {
      destroyAll();
      this.updatePlayerDisplay();
    });
    uiElements.push(closeBtn);
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

    console.log(`Potion restoration:`, {
      potion: potion.name,
      restoration: potion.restoration,
      rolled: restorationRoll,
      amount,
    });

    if (potion.type === 'health') {
      const oldHealth = player.health;
      player.health = Math.min(player.maxHealth, player.health + amount);
      const actualRestored = player.health - oldHealth;
      console.log(`Health: ${oldHealth} + ${amount} = ${player.health} (max: ${player.maxHealth}), actually restored: ${actualRestored}`);
      this.showMessage(`Used ${potion.name}! Restored ${actualRestored} HP (rolled ${amount})`);
    } else if (potion.type === 'stamina') {
      const oldStamina = player.stamina;
      player.stamina = Math.min(player.maxStamina, player.stamina + amount);
      const actualRestored = player.stamina - oldStamina;
      console.log(`Stamina: ${oldStamina} + ${amount} = ${player.stamina} (max: ${player.maxStamina}), actually restored: ${actualRestored}`);
      this.showMessage(`Used ${potion.name}! Restored ${actualRestored} Stamina (rolled ${amount})`);
    }

    this.gameState.removeItemFromInventory(itemId, 1);
    this.gameState.updatePlayer(player);
    this.updatePlayerDisplay();
  }

  private storeItem(itemId: string): void {
    const player = this.gameState.getPlayer();
    const totalFootlocker = player.footlocker.reduce((sum, item) => sum + item.quantity, 0);
    
    if (totalFootlocker >= player.footlockerSlots) {
      this.showMessage('Footlocker is full!');
      return;
    }

    if (this.gameState.removeItemFromInventory(itemId, 1)) {
      const existing = player.footlocker.find(item => item.itemId === itemId);
      if (existing) {
        existing.quantity += 1;
      } else {
        player.footlocker.push({ itemId, quantity: 1 });
      }
      
      this.gameState.updatePlayer(player);
      const item = ItemDatabase.getItem(itemId);
      this.showMessage(`Stored ${item?.name || 'item'} in footlocker`);
    }
  }

  private openFootlocker(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    let wheelHandler: ((pointer: any, gameObjects: any, deltaX: number, deltaY: number) => void) | null = null;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 900, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const headerBaseY = height / 2 - 240;
    const verticalGap = 65;

    const title = this.add.text(width / 2, headerBaseY, 'Vault Keeper', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#88ddff',
    }).setOrigin(0.5);
    uiElements.push(title);

    const destroyAll = () => {
      if (wheelHandler) {
        this.input.off('wheel', wheelHandler);
        wheelHandler = null;
      }
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'footlocker';

    const footlockerCount = player.footlocker.reduce((sum, item) => sum + item.quantity, 0);
    const inventoryCount = player.inventory.reduce((sum, item) => sum + item.quantity, 0);

    const headerY = headerBaseY + verticalGap;
    
    const footlockerTitle = this.add.text(width / 2 - 220, headerY, `Footlocker (${footlockerCount}/${player.footlockerSlots})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#88ddff',
    }).setOrigin(0.5);
    uiElements.push(footlockerTitle);

    const inventoryTitle = this.add.text(width / 2 + 220, headerY, `Inventory (${inventoryCount}/${player.inventorySlots})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(inventoryTitle);

    const scrollAreaTop = headerY + 30;
    const scrollAreaHeight = 320;
    const scrollAreaBottom = scrollAreaTop + scrollAreaHeight;
    const itemHeight = 28;
    const columnWidth = 400;

    const footlockerContainer = this.add.container(0, 0);
    uiElements.push(footlockerContainer);
    const inventoryContainer = this.add.container(0, 0);
    uiElements.push(inventoryContainer);

    const footlockerItems = player.footlocker;
    const inventoryItems = player.inventory;

    // Scroll state - declared early so click handlers can access them
    const footlockerTotalHeight = footlockerItems.length * itemHeight;
    const footlockerMaxScroll = Math.max(0, footlockerTotalHeight - scrollAreaHeight);
    let footlockerScroll = Math.min(this.footlockerScrollPosition.footlocker, footlockerMaxScroll);

    const inventoryTotalHeight = inventoryItems.length * itemHeight;
    const inventoryMaxScroll = Math.max(0, inventoryTotalHeight - scrollAreaHeight);
    let inventoryScroll = Math.min(this.footlockerScrollPosition.inventory, inventoryMaxScroll);

    footlockerItems.forEach((invItem, index) => {
      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) return;

      const y = scrollAreaTop + index * itemHeight;
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      
      const itemLabel = this.add.text(width / 2 - 420, y, `${item.name} x${invItem.quantity}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: itemColor,
      });
      footlockerContainer.add(itemLabel);

      const capturedIndex = index;
      const retrieveBtn = this.add.text(width / 2 - 80, y, '->', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#88ff88',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (pointer.worldY < scrollAreaTop || pointer.worldY > scrollAreaBottom) return;
          if (this.gameState.moveFromFootlockerByIndex(capturedIndex)) {
            this.showMessage(`Retrieved ${item.name}`);
            this.footlockerScrollPosition = { footlocker: footlockerScroll, inventory: inventoryScroll };
            destroyAll();
            this.openFootlocker();
          } else {
            this.showMessage('Inventory is full!');
          }
        });
      footlockerContainer.add(retrieveBtn);
    });

    if (footlockerItems.length === 0) {
      const emptyText = this.add.text(width / 2 - 220, scrollAreaTop + 20, 'Footlocker is empty', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#666666',
      }).setOrigin(0.5);
      footlockerContainer.add(emptyText);
    }

    inventoryItems.forEach((invItem, index) => {
      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) return;

      const y = scrollAreaTop + index * itemHeight;
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      
      const itemLabel = this.add.text(width / 2 + 70, y, `${item.name} x${invItem.quantity}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: itemColor,
      });
      inventoryContainer.add(itemLabel);

      const storeBtn = this.add.text(width / 2 + 30, y, '<-', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#ffaa44',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (pointer.worldY < scrollAreaTop || pointer.worldY > scrollAreaBottom) return;
          this.storeItem(invItem.itemId);
          this.footlockerScrollPosition = { footlocker: footlockerScroll, inventory: inventoryScroll };
          destroyAll();
          this.openFootlocker();
        });
      inventoryContainer.add(storeBtn);
    });

    if (inventoryItems.length === 0) {
      const emptyText = this.add.text(width / 2 + 220, scrollAreaTop + 20, 'Inventory is empty', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#666666',
      }).setOrigin(0.5);
      inventoryContainer.add(emptyText);
    }

    const footlockerMaskShape = this.make.graphics({});
    footlockerMaskShape.fillStyle(0xffffff);
    footlockerMaskShape.fillRect(width / 2 - 440, scrollAreaTop, columnWidth, scrollAreaHeight);
    const footlockerMask = footlockerMaskShape.createGeometryMask();
    footlockerContainer.setMask(footlockerMask);
    uiElements.push(footlockerMaskShape);

    const inventoryMaskShape = this.make.graphics({});
    inventoryMaskShape.fillStyle(0xffffff);
    inventoryMaskShape.fillRect(width / 2 + 20, scrollAreaTop, columnWidth, scrollAreaHeight);
    const inventoryMask = inventoryMaskShape.createGeometryMask();
    inventoryContainer.setMask(inventoryMask);
    uiElements.push(inventoryMaskShape);

    // Apply initial scroll positions
    footlockerContainer.y = -footlockerScroll;
    inventoryContainer.y = -inventoryScroll;

    let footlockerScrollThumb: Phaser.GameObjects.Rectangle | null = null;
    if (footlockerMaxScroll > 0) {
      const scrollbarX = width / 2 - 30;
      const scrollbarTrackHeight = scrollAreaHeight - 10;
      
      const scrollbarTrack = this.add.rectangle(scrollbarX, scrollAreaTop + scrollAreaHeight / 2, 6, scrollbarTrackHeight, 0x333344);
      uiElements.push(scrollbarTrack);
      
      const thumbHeight = Math.max(30, (scrollAreaHeight / footlockerTotalHeight) * scrollbarTrackHeight);
      const scrollRatio = footlockerMaxScroll > 0 ? footlockerScroll / footlockerMaxScroll : 0;
      const thumbY = scrollAreaTop + thumbHeight / 2 + 5 + scrollRatio * (scrollbarTrackHeight - thumbHeight);
      footlockerScrollThumb = this.add.rectangle(scrollbarX, thumbY, 6, thumbHeight, 0x88ddff);
      uiElements.push(footlockerScrollThumb);
    }

    let inventoryScrollThumb: Phaser.GameObjects.Rectangle | null = null;
    if (inventoryMaxScroll > 0) {
      const scrollbarX = width / 2 + 430;
      const scrollbarTrackHeight = scrollAreaHeight - 10;
      
      const scrollbarTrack = this.add.rectangle(scrollbarX, scrollAreaTop + scrollAreaHeight / 2, 6, scrollbarTrackHeight, 0x333344);
      uiElements.push(scrollbarTrack);
      
      const thumbHeight = Math.max(30, (scrollAreaHeight / inventoryTotalHeight) * scrollbarTrackHeight);
      const scrollRatio = inventoryMaxScroll > 0 ? inventoryScroll / inventoryMaxScroll : 0;
      const thumbY = scrollAreaTop + thumbHeight / 2 + 5 + scrollRatio * (scrollbarTrackHeight - thumbHeight);
      inventoryScrollThumb = this.add.rectangle(scrollbarX, thumbY, 6, thumbHeight, 0xf0a020);
      uiElements.push(inventoryScrollThumb);
    }

    wheelHandler = (pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
      const isOverFootlocker = pointer.x < width / 2;
      
      if (isOverFootlocker && footlockerMaxScroll > 0) {
        footlockerScroll = Math.max(0, Math.min(footlockerMaxScroll, footlockerScroll + deltaY * 0.5));
        footlockerContainer.y = -footlockerScroll;
        
        if (footlockerScrollThumb) {
          const scrollbarTrackHeight = scrollAreaHeight - 10;
          const thumbHeight = footlockerScrollThumb.height;
          const scrollRatio = footlockerScroll / footlockerMaxScroll;
          const thumbY = scrollAreaTop + thumbHeight / 2 + 5 + scrollRatio * (scrollbarTrackHeight - thumbHeight);
          footlockerScrollThumb.y = thumbY;
        }
      } else if (!isOverFootlocker && inventoryMaxScroll > 0) {
        inventoryScroll = Math.max(0, Math.min(inventoryMaxScroll, inventoryScroll + deltaY * 0.5));
        inventoryContainer.y = -inventoryScroll;
        
        if (inventoryScrollThumb) {
          const scrollbarTrackHeight = scrollAreaHeight - 10;
          const thumbHeight = inventoryScrollThumb.height;
          const scrollRatio = inventoryScroll / inventoryMaxScroll;
          const thumbY = scrollAreaTop + thumbHeight / 2 + 5 + scrollRatio * (scrollbarTrackHeight - thumbHeight);
          inventoryScrollThumb.y = thumbY;
        }
      }
    };
    this.input.on('wheel', wheelHandler);

    const divider = this.add.rectangle(width / 2, scrollAreaTop + scrollAreaHeight / 2, 2, scrollAreaHeight, 0x444466);
    uiElements.push(divider);

    const closeBtn = this.createButton(width / 2, height / 2 + 230, 'Close', () => {
      destroyAll();
    });
    uiElements.push(closeBtn);
  }

  private openEquipment(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    uiElements.push(overlay);

    const panelWidth = 370;
    const panelHeight = 510;
    const panelX = width / 2;
    const panelY = height / 2 - 30;

    const panel = this.add.image(panelX, panelY, 'equipment-panel').setOrigin(0.5);
    uiElements.push(panel);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'equipment';

    const gridCellWidth = 110;
    const gridCellHeight = 105;
    const hitAreaSize = 85;
    const gridStartX = panelX - 110;
    const gridStartY = panelY - 132;

    const gridSlots: Array<{ key: keyof PlayerEquipment | null; row: number; col: number }> = [
      { key: null, row: 0, col: 0 },
      { key: 'helmet', row: 0, col: 1 },
      { key: null, row: 0, col: 2 },
      { key: 'shoulders', row: 1, col: 0 },
      { key: 'chest', row: 1, col: 1 },
      { key: 'cape', row: 1, col: 2 },
      { key: 'mainHand', row: 2, col: 0 },
      { key: 'legs', row: 2, col: 1 },
      { key: 'offHand', row: 2, col: 2 },
      { key: null, row: 3, col: 0 },
      { key: 'boots', row: 3, col: 1 },
      { key: null, row: 3, col: 2 },
    ];

    const infoAreaY = panelY + panelHeight / 2 + 10;
    let selectedSlot: { key: keyof PlayerEquipment; x: number; y: number } | null = null;
    let infoElements: Phaser.GameObjects.GameObject[] = [];

    const getEquippableItemsForSlot = (slot: keyof PlayerEquipment): InventoryItem[] => {
      return player.inventory.filter(invItem => {
        const check = EquipmentManager.canEquip(player, invItem.itemId, slot);
        return check.canEquip;
      });
    };

    const updateInfoDisplay = () => {
      infoElements.forEach(el => el.destroy());
      infoElements = [];

      if (selectedSlot) {
        const equipped = player.equipment[selectedSlot.key];
        const equippableItems = getEquippableItemsForSlot(selectedSlot.key);

        if (equipped) {
          const itemName = ForgingSystem.getItemDisplayName({ 
            itemId: equipped.itemId, 
            quantity: 1, 
            enhancementLevel: equipped.enhancementLevel 
          });

          const currentDurability = equipped.durability ?? 100;
          const maxDurability = equipped.maxDurability ?? 100;
          const durabilityPercent = (currentDurability / maxDurability) * 100;
          
          let durabilityColor = '#88ff88';
          if (durabilityPercent <= 0) durabilityColor = '#ff4444';
          else if (durabilityPercent <= 25) durabilityColor = '#ffaa00';
          else if (durabilityPercent <= 50) durabilityColor = '#ffff00';

          const itemColor = ItemColorUtil.getItemColor(equipped.enhancementLevel, equipped.isShiny);

          const infoBg = this.add.rectangle(width / 2, infoAreaY + 20, 350, 90, 0x1a1a2e, 0.95).setOrigin(0.5);
          infoElements.push(infoBg);

          const nameLabel = this.add.text(width / 2, infoAreaY - 10, itemName, {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: itemColor,
          }).setOrigin(0.5);
          infoElements.push(nameLabel);

          const durabilityLabel = this.add.text(width / 2, infoAreaY + 10, `Durability: ${Math.floor(currentDurability)}/${maxDurability}`, {
            fontFamily: FONTS.primary,
            fontSize: '11px',
            color: durabilityColor,
          }).setOrigin(0.5);
          infoElements.push(durabilityLabel);

          const unequipBtn = this.add.text(width / 2 - 60, infoAreaY + 35, '[Unequip]', {
            fontFamily: FONTS.primary,
            fontSize: '11px',
            color: '#ff8888',
            backgroundColor: '#2a2a3e',
            padding: { x: 8, y: 4 },
          }).setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              const result = EquipmentManager.unequipItem(player, selectedSlot!.key);
              this.showMessage(result.message);
              if (result.success) {
                this.gameState.updatePlayer(player);
              }
              destroyAll();
              this.openEquipment();
            });
          infoElements.push(unequipBtn);

          if (equippableItems.length > 0) {
            const changeBtn = this.add.text(width / 2 + 60, infoAreaY + 35, '[Change]', {
              fontFamily: FONTS.primary,
              fontSize: '11px',
              color: '#88ff88',
              backgroundColor: '#2a2a3e',
              padding: { x: 8, y: 4 },
            }).setOrigin(0.5)
              .setInteractive({ useHandCursor: true })
              .on('pointerdown', () => {
                this.showEquipDropdown(selectedSlot!.key, equippableItems, destroyAll);
              });
            infoElements.push(changeBtn);
          }

          infoElements.forEach(el => uiElements.push(el));
        } else {
          if (equippableItems.length > 0) {
            const infoBg = this.add.rectangle(width / 2, infoAreaY + 10, 350, 50, 0x1a1a2e, 0.95).setOrigin(0.5);
            infoElements.push(infoBg);

            const emptyLabel = this.add.text(width / 2, infoAreaY, 'Slot is empty', {
              fontFamily: FONTS.primary,
              fontSize: FONTS.size.small,
              color: '#888888',
            }).setOrigin(0.5);
            infoElements.push(emptyLabel);

            const equipBtn = this.add.text(width / 2, infoAreaY + 25, '[Equip Item]', {
              fontFamily: FONTS.primary,
              fontSize: '11px',
              color: '#88ff88',
              backgroundColor: '#2a2a3e',
              padding: { x: 8, y: 4 },
            }).setOrigin(0.5)
              .setInteractive({ useHandCursor: true })
              .on('pointerdown', () => {
                this.showEquipDropdown(selectedSlot!.key, equippableItems, destroyAll);
              });
            infoElements.push(equipBtn);

            infoElements.forEach(el => uiElements.push(el));
          }
        }
      }
    };

    gridSlots.forEach((gridSlot) => {
      if (!gridSlot.key) return;

      const slotX = gridStartX + gridSlot.col * gridCellWidth;
      const slotY = gridStartY + gridSlot.row * gridCellHeight;

      const equipped = player.equipment[gridSlot.key];
      
      const slotHitArea = this.add.rectangle(slotX, slotY, hitAreaSize, hitAreaSize, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          selectedSlot = { key: gridSlot.key!, x: slotX, y: slotY };
          updateInfoDisplay();
        })
        .on('pointerover', (pointer: Phaser.Input.Pointer) => {
          if (this.itemTooltip && equipped) {
            this.itemTooltip.show(pointer.x, pointer.y, equipped);
          }
        })
        .on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (this.itemTooltip && equipped) {
            this.itemTooltip.updatePosition(pointer.x, pointer.y);
          }
        })
        .on('pointerout', () => {
          if (this.itemTooltip) {
            this.itemTooltip.hide();
          }
        });
      uiElements.push(slotHitArea);
      
      if (equipped) {
        const spriteKey = ItemSprites.getSpriteKey(equipped.itemId);
        
        if (spriteKey) {
          const spriteOffsetX = 3;
          const spriteOffsetY = 4;
          const itemSprite = this.add.image(slotX + spriteOffsetX, slotY + spriteOffsetY, equipped.itemId);
          itemSprite.setOrigin(0.5);
          
          const maxSize = 70;
          const scale = Math.min(maxSize / itemSprite.width, maxSize / itemSprite.height);
          itemSprite.setScale(scale);
          
          uiElements.push(itemSprite);
        } else {
          const itemName = ForgingSystem.getItemDisplayName({ 
            itemId: equipped.itemId, 
            quantity: 1, 
            enhancementLevel: equipped.enhancementLevel 
          });

          const itemColor = ItemColorUtil.getItemColor(equipped.enhancementLevel, equipped.isShiny);
          const itemLabel = this.add.text(slotX, slotY, itemName, {
            fontFamily: FONTS.primary,
            fontSize: '10px',
            color: itemColor,
            wordWrap: { width: 80 },
            align: 'center',
          }).setOrigin(0.5);
          uiElements.push(itemLabel);
        }
      } else {
        const emptyLabel = this.add.text(slotX, slotY, 'Empty', {
          fontFamily: FONTS.primary,
          fontSize: '10px',
          color: '#666666',
        }).setOrigin(0.5);
        uiElements.push(emptyLabel);
      }
    });

    const statsY = infoAreaY + 80;
    const statsTitle = this.add.text(width / 2 - 150, statsY, 'Combat Stats:', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#f0a020',
    });
    uiElements.push(statsTitle);

    const statsText = [
      `Evasion: ${player.stats.calculatedEvasion}`,
      `Damage Reduction: ${Math.floor(player.stats.damageReduction * 100)}%`,
      `Attack Bonus: +${player.stats.attackBonus}`,
      `Damage Bonus: +${player.stats.damageBonus}`,
    ].join('  |  ');

    const statsDisplay = this.add.text(width / 2, statsY + 25, statsText, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5);
    uiElements.push(statsDisplay);

    const closeBtn = this.createButton(width / 2, statsY + 70, 'Close', () => {
      destroyAll();
      this.updatePlayerDisplay();
    });
    uiElements.push(closeBtn);
  }

  private showEquipDropdown(slot: keyof PlayerEquipment, items: InventoryItem[], onClose: () => void): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.9).setOrigin(0);
    uiElements.push(overlay);

    const panelWidth = 400;
    const panelHeight = Math.min(450, 150 + items.length * 40);
    const panel = this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(panel);

    const slotNames: Record<keyof PlayerEquipment, string> = {
      helmet: 'Helmet',
      shoulders: 'Shoulders',
      chest: 'Chest',
      cape: 'Cape',
      mainHand: 'Main Hand',
      offHand: 'Off Hand',
      legs: 'Legs',
      boots: 'Boots'
    };

    const title = this.add.text(width / 2, height / 2 - panelHeight / 2 + 30, `Equip to ${slotNames[slot]}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
    };

    const itemStartY = height / 2 - panelHeight / 2 + 70;
    const itemHeight = 35;
    const maxDisplay = 10;

    items.slice(0, maxDisplay).forEach((invItem, index) => {
      const y = itemStartY + index * itemHeight;
      const displayName = ForgingSystem.getItemDisplayName(invItem);
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);

      const itemText = this.add.text(width / 2 - 150, y, displayName, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
      }).setInteractive({ useHandCursor: true })
        .on('pointerover', (pointer: Phaser.Input.Pointer) => {
          if (this.itemTooltip) {
            this.itemTooltip.show(pointer.x, pointer.y, invItem);
          }
        })
        .on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (this.itemTooltip) {
            this.itemTooltip.updatePosition(pointer.x, pointer.y);
          }
        })
        .on('pointerout', () => {
          if (this.itemTooltip) {
            this.itemTooltip.hide();
          }
        });
      uiElements.push(itemText);

      const durability = invItem.durability ?? 100;
      const maxDurability = invItem.maxDurability ?? 100;
      const durabilityPercent = (durability / maxDurability) * 100;
      let durabilityColor = '#88ff88';
      if (durabilityPercent <= 0) durabilityColor = '#ff4444';
      else if (durabilityPercent <= 25) durabilityColor = '#ffaa00';
      else if (durabilityPercent <= 50) durabilityColor = '#ffff00';

      const durabilityText = this.add.text(width / 2 + 20, y, `${Math.floor(durability)}/${maxDurability}`, {
        fontFamily: FONTS.primary,
        fontSize: '11px',
        color: durabilityColor,
      });
      uiElements.push(durabilityText);

      const equipBtn = this.add.text(width / 2 + 120, y, '[Equip]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#88ff88',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const result = EquipmentManager.equipItem(player, invItem.itemId, slot);
          this.showMessage(result.message);
          if (result.success) {
            this.gameState.updatePlayer(player);
          }
          destroyAll();
          onClose();
          this.openEquipment();
        });
      uiElements.push(equipBtn);
    });

    const closeBtn = this.createButton(width / 2, height / 2 + panelHeight / 2 - 30, 'Cancel', () => {
      destroyAll();
    });
    uiElements.push(closeBtn);
  }

  private openShop(): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    let currentCategory: 'weapons' | 'armor' | 'potions' = 'weapons';
    let wheelHandler: ((pointer: any, gameObjects: any, deltaX: number, deltaY: number) => void) | null = null;

    const renderShop = () => {
      // Clean up previous wheel handler if exists
      if (wheelHandler) {
        this.input.off('wheel', wheelHandler);
        wheelHandler = null;
      }

      uiElements.forEach(el => el.destroy());
      uiElements.length = 0;

      const player = this.gameState.getPlayer();

      const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
      const panel = this.add.rectangle(width / 2, height / 2, 750, 550, 0x2a2a3e).setOrigin(0.5);
      uiElements.push(overlay, panel);

      // Header layout with improved spacing (matching Blacksmith's Forge)
      const headerBaseY = height / 2 - 240;
      const verticalGap = 65;  // Consistent with forge

      // Row 1: Title
      const title = this.add.text(width / 2, headerBaseY, 'Merchant\'s Shop', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.large,
        color: '#f0a020',
      }).setOrigin(0.5);
      uiElements.push(title);

      // Row 2: Currencies (centered, consistent with StatsPanel)
      const currencyDisplay = CurrencyDisplay.createInlineCurrency(
        this,
        width / 2,
        headerBaseY + verticalGap,
        player.arcaneAsh,
        player.crystallineAnimus,
        'xsmall'  // Changed from 'small' to match forge and sidebar
      );
      currencyDisplay.setScrollFactor(0);
      currencyDisplay.x -= currencyDisplay.getBounds().width / 2;
      uiElements.push(currencyDisplay);

      // Row 3: Category tabs (increased spacing)
      const tabY = headerBaseY + (verticalGap * 2);
      const tabSpacing = 220;  // Increased from 120 to match forge

      const weaponsTab = this.add.text(width / 2 - tabSpacing, tabY, 'Weapons', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' for consistency
        color: currentCategory === 'weapons' ? '#ffffff' : '#888888',
        backgroundColor: currentCategory === 'weapons' ? '#444466' : '#2a2a3e',
        padding: { x: 15, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          currentCategory = 'weapons';
          renderShop();
        });
      uiElements.push(weaponsTab);

      const armorTab = this.add.text(width / 2, tabY, 'Armor', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' for consistency
        color: currentCategory === 'armor' ? '#ffffff' : '#888888',
        backgroundColor: currentCategory === 'armor' ? '#444466' : '#2a2a3e',
        padding: { x: 15, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          currentCategory = 'armor';
          renderShop();
        });
      uiElements.push(armorTab);

      const potionsTab = this.add.text(width / 2 + tabSpacing, tabY, 'Potions', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' for consistency
        color: currentCategory === 'potions' ? '#ffffff' : '#888888',
        backgroundColor: currentCategory === 'potions' ? '#444466' : '#2a2a3e',
        padding: { x: 15, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          currentCategory = 'potions';
          renderShop();
        });
      uiElements.push(potionsTab);

      let shopItems;
      if (currentCategory === 'weapons') {
        shopItems = ShopData.getWeaponShopItems();
      } else if (currentCategory === 'armor') {
        shopItems = ShopData.getArmorShopItems();
      } else {
        shopItems = ShopData.getPotionShopItems();
      }

      // Scrollable item list setup
      const scrollAreaTop = height / 2 - 70;  // Start of visible area
      const scrollAreaBottom = height / 2 + 210;  // End of visible area (just above Close button)
      const scrollAreaHeight = scrollAreaBottom - scrollAreaTop;
      const itemHeight = 28;

      // Create container for all items
      const itemsContainer = this.add.container(0, 0);
      uiElements.push(itemsContainer);

      // Create all items in the container
      const itemElements: Phaser.GameObjects.GameObject[] = [];
      shopItems.forEach((shopItem, index) => {
        const item = ItemDatabase.getItem(shopItem.itemId);
        if (!item) return;

        const y = scrollAreaTop + index * itemHeight;

        const itemColor = ItemColorUtil.getItemColor(undefined, undefined);
        const itemLabel = this.add.text(width / 2 - 340, y, item.name, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: itemColor,
        });
        itemsContainer.add(itemLabel);
        itemElements.push(itemLabel);

        const currencyLabel = shopItem.currency === 'AA' ? 'AA' : 'CA';
        const priceLabel = this.add.text(width / 2 + 80, y, `${shopItem.price} ${currencyLabel}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: shopItem.currency === 'AA' ? '#ffcc00' : '#cc66ff',
        });
        itemsContainer.add(priceLabel);
        itemElements.push(priceLabel);

        const playerCurrency = shopItem.currency === 'AA' ? player.arcaneAsh : player.crystallineAnimus;
        const canAfford = playerCurrency >= shopItem.price;
        const buyBtn = this.add.text(width / 2 + 200, y, '[Buy]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: canAfford ? '#88ff88' : '#666666',
        }).setInteractive({ useHandCursor: canAfford })
          .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Only process click if pointer is within visible scroll area
            if (pointer.worldY < scrollAreaTop || pointer.worldY > scrollAreaBottom) {
              return; // Pointer is outside visible area, ignore click
            }
            
            if (canAfford) {
              this.purchaseItem(shopItem.itemId, shopItem.price, shopItem.currency);
              renderShop();
            }
          });
        itemsContainer.add(buyBtn);
        itemElements.push(buyBtn);
      });

      // Create mask for scrollable area
      const maskShape = this.make.graphics({});
      maskShape.fillStyle(0xffffff);
      maskShape.fillRect(width / 2 - 375, scrollAreaTop, 750, scrollAreaHeight);
      const mask = maskShape.createGeometryMask();
      itemsContainer.setMask(mask);
      uiElements.push(maskShape);

      // Calculate scroll bounds
      const totalContentHeight = shopItems.length * itemHeight;
      const maxScroll = Math.max(0, totalContentHeight - scrollAreaHeight);
      let currentScroll = 0;

      // Visual scrollbar (only show if content is scrollable)
      let scrollbarThumb: Phaser.GameObjects.Rectangle | null = null;
      if (maxScroll > 0) {
        const scrollbarX = width / 2 + 350;
        const scrollbarTrackHeight = scrollAreaHeight - 10;
        
        // Scrollbar track
        const scrollbarTrack = this.add.rectangle(
          scrollbarX,
          scrollAreaTop + scrollAreaHeight / 2,
          8,
          scrollbarTrackHeight,
          0x444444,
          0.5
        );
        uiElements.push(scrollbarTrack);
        
        // Scrollbar thumb (movable)
        const thumbHeight = Math.max(30, (scrollAreaHeight / totalContentHeight) * scrollbarTrackHeight);
        scrollbarThumb = this.add.rectangle(
          scrollbarX,
          scrollAreaTop + 5 + thumbHeight / 2,
          8,
          thumbHeight,
          0x888888,
          0.8
        );
        uiElements.push(scrollbarThumb);
      }

      // Mouse wheel scroll handler
      wheelHandler = (pointer: any, gameObjects: any, deltaX: number, deltaY: number) => {
        currentScroll = Phaser.Math.Clamp(currentScroll + deltaY * 0.5, 0, maxScroll);
        itemsContainer.y = -currentScroll;
        
        // Update scrollbar position
        if (scrollbarThumb && maxScroll > 0) {
          const scrollPercent = currentScroll / maxScroll;
          const scrollbarTrackHeight = scrollAreaHeight - 10;
          const thumbHeight = scrollbarThumb.height;
          const maxThumbY = scrollAreaTop + 5 + scrollbarTrackHeight - thumbHeight;
          const minThumbY = scrollAreaTop + 5 + thumbHeight / 2;
          scrollbarThumb.y = minThumbY + (scrollPercent * (maxThumbY - minThumbY));
        }
      };

      this.input.on('wheel', wheelHandler);

      const closeBtn = this.createButton(width / 2, height / 2 + 240, 'Close', () => {
        destroyAll();
        this.updatePlayerDisplay();
      });
      uiElements.push(closeBtn);
    };

    const destroyAll = () => {
      // Clean up wheel handler
      if (wheelHandler) {
        this.input.off('wheel', wheelHandler);
        wheelHandler = null;
      }
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'shop';

    renderShop();
  }

  private async purchaseItem(itemId: string, price: number, currency: 'AA' | 'CA'): Promise<void> {
    const player = this.gameState.getPlayer();
    
    const playerCurrency = currency === 'AA' ? player.arcaneAsh : player.crystallineAnimus;
    const currencyName = currency === 'AA' ? 'Arcane Ash' : 'Crystalline Animus';
    
    if (playerCurrency < price) {
      this.showMessage(`Not enough ${currencyName}!`);
      return;
    }

    const totalInventory = player.inventory.reduce((sum, item) => sum + item.quantity, 0);
    if (totalInventory >= player.inventorySlots) {
      this.showMessage('Inventory is full!');
      return;
    }

    try {
      const response = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId, price, currency }),
      });

      if (!response.ok) {
        const error = await response.json();
        this.showMessage(error.message || 'Purchase failed!');
        return;
      }

      const result = await response.json();

      if (result.newArcaneAsh !== undefined) {
        player.arcaneAsh = result.newArcaneAsh;
      }
      if (result.newCrystallineAnimus !== undefined) {
        player.crystallineAnimus = result.newCrystallineAnimus;
      }
      if (result.inventory) {
        player.inventory = result.inventory;
      }

      this.gameState.updatePlayer(player);
      
      // Save state after purchase to ensure consistency
      this.gameState.saveToServer();
      
      const item = ItemDatabase.getItem(itemId);
      this.showMessage(`Purchased ${item?.name || 'item'} for ${price} ${currency}!`);
      this.updatePlayerDisplay();
    } catch (error) {
      console.error('Purchase error:', error);
      this.showMessage('Purchase failed - please try again');
    }
  }

  private openForge(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    let selectedItem: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null; inventoryIndex?: number } | null = null;
    let mode: 'enhance' | 'repair' = 'enhance';

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 900, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    // Header layout with improved spacing
    const headerBaseY = height / 2 - 240;
    const verticalGap = 65;  // Increased from 40px for better breathing room

    // Row 1: Title
    const title = this.add.text(width / 2, headerBaseY, 'Blacksmith\'s Forge', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'forge';

    const renderForge = () => {
      uiElements.slice(3).forEach(el => el.destroy());
      uiElements.splice(3);

      // Row 2: Tab buttons (centered horizontally with increased spacing)
      const tabY = headerBaseY + verticalGap;  // One gap down from title
      const tabSpacing = 220;  // Increased from 150px to prevent overlap

      // Check if there are any repairable items to show Repair All button
      const player = this.gameState.getPlayer();
      const repairableItems: Array<{ item: InventoryItem; equippedSlot: keyof PlayerEquipment | null }> = [];
      player.inventory.filter(item => ForgingSystem.needsRepair(item)).forEach(item => {
        repairableItems.push({ item, equippedSlot: null });
      });
      Object.entries(player.equipment).forEach(([slot, item]) => {
        if (item && ForgingSystem.needsRepair(item)) {
          repairableItems.push({ item, equippedSlot: slot as keyof PlayerEquipment });
        }
      });

      // Layout tabs with consistent spacing
      if (repairableItems.length > 0) {
        // Three-button layout: [Enhance] [Repair All] [Repair]
        const enhanceTab = this.add.text(width / 2 - tabSpacing, tabY, '[Enhance]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: mode === 'enhance' ? '#f0a020' : '#888888',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            mode = 'enhance';
            selectedItem = null;
            renderForge();
          });
        uiElements.push(enhanceTab);

        const repairAllTab = this.add.text(width / 2, tabY, '[Repair All]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#88ff88',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.showRepairAllConfirmation(repairableItems);
          });
        uiElements.push(repairAllTab);

        const repairTab = this.add.text(width / 2 + tabSpacing, tabY, '[Repair]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: mode === 'repair' ? '#f0a020' : '#888888',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            mode = 'repair';
            selectedItem = null;
            renderForge();
          });
        uiElements.push(repairTab);
      } else {
        // Two-button layout: [Enhance] [Repair] (centered)
        const twoButtonSpacing = 110;  // Half of tabSpacing for two-button layout
        
        const enhanceTab = this.add.text(width / 2 - twoButtonSpacing, tabY, '[Enhance]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: mode === 'enhance' ? '#f0a020' : '#888888',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            mode = 'enhance';
            selectedItem = null;
            renderForge();
          });
        uiElements.push(enhanceTab);

        const repairTab = this.add.text(width / 2 + twoButtonSpacing, tabY, '[Repair]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: mode === 'repair' ? '#f0a020' : '#888888',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            mode = 'repair';
            selectedItem = null;
            renderForge();
          });
        uiElements.push(repairTab);
      }

      if (mode === 'enhance') {
        this.renderEnhanceMode(uiElements, selectedItem, (item) => {
          selectedItem = item;
          renderForge();
        });
      } else {
        this.renderRepairMode(uiElements, selectedItem, (item) => {
          selectedItem = item;
          renderForge();
        });
      }

      const closeBtn = this.createButton(width / 2, height / 2 + 230, 'Close', () => {
        destroyAll();
      });
      uiElements.push(closeBtn);
    };

    renderForge();
  }

  private renderEnhanceMode(uiElements: Phaser.GameObjects.GameObject[], selectedItem: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null; inventoryIndex?: number } | null, onSelect: (item: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null; inventoryIndex?: number } | null) => void): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    
    const forgeableItems: Array<{ item: InventoryItem; equippedSlot: keyof PlayerEquipment | null; inventoryIndex?: number }> = [];
    
    player.inventory.forEach((item, index) => {
      if (ForgingSystem.canForgeItem(item)) {
        forgeableItems.push({ item, equippedSlot: null, inventoryIndex: index });
      }
    });
    
    Object.entries(player.equipment).forEach(([slot, equipped]) => {
      if (equipped && ForgingSystem.canForgeItem(equipped)) {
        forgeableItems.push({ item: equipped, equippedSlot: slot as keyof PlayerEquipment });
      }
    });

    if (forgeableItems.length === 0) {
      const noItemsText = this.add.text(width / 2, height / 2, 'No forgeable items in inventory or equipped.\n(Weapons and armor can be enhanced)', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#cccccc',
        align: 'center',
      }).setOrigin(0.5);
      uiElements.push(noItemsText);
      return;
    }

    const itemsStartY = height / 2 - 70;  // Positioned with proper spacing below tabs
    const itemHeight = 28;  // Reduced from 35 to match smaller font
    const maxDisplay = 7;
    
    // Fixed column positions for grid-like alignment
    // Panel is 900px wide (width/2 ± 450), so we have plenty of space
    const colNameX = width / 2 - 420;      // Column 1: Item names (~420px width)
    const colValueX = width / 2;           // Column 2: Enhancement values (~150px width)
    const colButtonX = width / 2 + 150;    // Column 3: [Select] buttons

    forgeableItems.slice(0, maxDisplay).forEach((itemData, index) => {
      const y = itemsStartY + index * itemHeight;
      const displayName = ForgingSystem.getItemDisplayName(itemData.item);
      const currentLevel = itemData.item.enhancementLevel || 0;
      const maxLevel = ForgingSystem.getMaxEnhancementLevel();
      
      const itemColor = ItemColorUtil.getItemColor(itemData.item.enhancementLevel, itemData.item.isShiny);
      
      let itemNameText = displayName;
      if (itemData.equippedSlot) {
        itemNameText += ' [E]';
      }
      
      // Column 1: Item name
      const itemText = this.add.text(colNameX, y, itemNameText, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' to match tab buttons
        color: itemColor,
      });
      uiElements.push(itemText);

      // Column 2: Enhancement value
      const levelText = this.add.text(colValueX, y, currentLevel === maxLevel ? 'MAX' : `+${currentLevel}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' to match tab buttons
        color: currentLevel === maxLevel ? '#ff8800' : '#88ff88',
      });
      uiElements.push(levelText);

      // Column 3: [Select] button
      if (currentLevel < maxLevel) {
        const selectBtn = this.add.text(colButtonX, y, '[Select]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,  // Changed from 'small' to match tab buttons
          color: selectedItem === itemData ? '#ff8800' : '#8888ff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => onSelect(itemData));
        uiElements.push(selectBtn);
      }
    });

    if (selectedItem) {
      const detailY = height / 2 + 105;
      const currentLevel = selectedItem.item.enhancementLevel || 0;
      const targetLevel = currentLevel + 1;
      const cost = ForgingSystem.getForgingCost(targetLevel);

      if (cost) {
        const dimOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.2).setOrigin(0.5);
        uiElements.push(dimOverlay);
        
        const detailPanel = this.add.rectangle(width / 2, detailY, 800, 195, 0x1a1a2e).setOrigin(0.5);
        uiElements.push(detailPanel);

        const detailTitle = this.add.text(width / 2, detailY - 80, `Enhance to +${targetLevel}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#f0a020',
          resolution: 2,
        }).setOrigin(0.5);
        uiElements.push(detailTitle);

        const tierData = [
          { success: '95%', fail: 'No change', destroy: 'None' },
          { success: '85%', fail: 'No change', destroy: 'None' },
          { success: '70%', fail: 'Downgrade', destroy: 'None' },
          { success: '60%', fail: 'Downgrade', destroy: 'None' },
          { success: '45%', fail: 'Downgrade', destroy: '10%' },
          { success: '35%', fail: 'Downgrade', destroy: '15%' },
          { success: '25%', fail: 'Downgrade', destroy: '25%' },
          { success: '15%', fail: 'Downgrade', destroy: '35%' },
          { success: '10%', fail: 'Downgrade', destroy: '50%' },
        ][targetLevel - 1];

        const detailsText = this.add.text(width / 2, detailY - 50, 
          `Success: ${tierData.success}  |  Fail: ${tierData.fail}  |  Destroy: ${tierData.destroy}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#ffffff',
          align: 'center',
          resolution: 2,
        }).setOrigin(0.5);
        uiElements.push(detailsText);
        
        const costText = this.add.text(width / 2, detailY - 25, 
          `Cost: ${cost.aa} AA + ${cost.ca} CA`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#aaaaaa',
          align: 'center',
          resolution: 2,
        }).setOrigin(0.5);
        uiElements.push(costText);
        
        const benefitText = this.itemTooltip?.getEnhancementBenefitText(selectedItem.item) || '';
        if (benefitText) {
          const benefitHeaderLabel = this.add.text(width / 2, detailY + 5, 
            'Success benefits', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.xsmall,
            color: '#88ff88',
            align: 'center',
            resolution: 2,
          }).setOrigin(0.5);
          uiElements.push(benefitHeaderLabel);
          
          const benefitDetailLabel = this.add.text(width / 2, detailY + 25, 
            benefitText, {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.xsmall,
            color: '#88ff88',
            align: 'center',
            resolution: 2,
          }).setOrigin(0.5);
          uiElements.push(benefitDetailLabel);
        }

        const forgeBtn = this.createButton(width / 2 - 160, detailY + 70, 'Forge Item', () => {
          this.attemptForging(selectedItem!);
          onSelect(null);
        });
        uiElements.push(forgeBtn);
        
        const backBtn = this.createButton(width / 2 + 160, detailY + 70, 'Back', () => {
          onSelect(null);
        });
        uiElements.push(backBtn);
      }
    }
  }

  private renderRepairMode(uiElements: Phaser.GameObjects.GameObject[], selectedItem: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null } | null, onSelect: (item: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null } | null) => void): void {
    const { width, height} = this.cameras.main;
    const player = this.gameState.getPlayer();
    
    const repairableItems: Array<{ item: InventoryItem; equippedSlot: keyof PlayerEquipment | null }> = [];
    
    player.inventory.forEach(item => {
      const currentDurability = item.durability ?? 100;
      const maxDurability = item.maxDurability ?? 100;
      if ((ItemDatabase.getWeapon(item.itemId) || ItemDatabase.getArmor(item.itemId)) && currentDurability < maxDurability) {
        repairableItems.push({ item, equippedSlot: null });
      }
    });
    
    Object.entries(player.equipment).forEach(([slot, equipped]) => {
      if (equipped) {
        const currentDurability = equipped.durability ?? 100;
        const maxDurability = equipped.maxDurability ?? 100;
        if ((ItemDatabase.getWeapon(equipped.itemId) || ItemDatabase.getArmor(equipped.itemId)) && currentDurability < maxDurability) {
          repairableItems.push({ item: equipped, equippedSlot: slot as keyof PlayerEquipment });
        }
      }
    });

    if (repairableItems.length === 0) {
      const noItemsText = this.add.text(width / 2, height / 2, 'No items need repair!\nAll your equipment is in perfect condition.', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#cccccc',
        align: 'center',
      }).setOrigin(0.5);
      uiElements.push(noItemsText);
      return;
    }

    const itemsStartY = height / 2 - 70;  // Positioned with proper spacing below tabs
    const itemHeight = 28;  // Reduced from 35 to match smaller font
    const maxDisplay = 7;
    
    // Fixed column positions for grid-like alignment (same as Enhancement tab)
    // Panel is 900px wide (width/2 ± 450), so we have plenty of space
    const colNameX = width / 2 - 420;      // Column 1: Item names (~420px width)
    const colValueX = width / 2;           // Column 2: Durability values (~150px width)
    const colButtonX = width / 2 + 150;    // Column 3: [Select] buttons

    repairableItems.slice(0, maxDisplay).forEach((itemData, index) => {
      const y = itemsStartY + index * itemHeight;
      const displayName = ForgingSystem.getItemDisplayName(itemData.item);
      const currentDurability = itemData.item.durability ?? 100;
      const maxDurability = itemData.item.maxDurability ?? 100;
      const durabilityPercent = (currentDurability / maxDurability) * 100;
      
      let durabilityColor = '#88ff88';
      if (durabilityPercent <= 0) durabilityColor = '#ff4444';
      else if (durabilityPercent <= 25) durabilityColor = '#ffaa00';
      else if (durabilityPercent <= 50) durabilityColor = '#ffff00';
      
      const itemColor = ItemColorUtil.getItemColor(itemData.item.enhancementLevel, itemData.item.isShiny);
      
      let itemNameText = displayName;
      if (itemData.equippedSlot) {
        itemNameText += ' [E]';
      }
      
      // Column 1: Item name
      const itemText = this.add.text(colNameX, y, itemNameText, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' to match tab buttons
        color: itemColor,
      });
      uiElements.push(itemText);

      // Column 2: Durability value
      const durabilityText = this.add.text(colValueX, y, `${Math.floor(currentDurability)}/${maxDurability}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' to match tab buttons
        color: durabilityColor,
      });
      uiElements.push(durabilityText);

      // Column 3: [Select] button
      const selectBtn = this.add.text(colButtonX, y, '[Select]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,  // Changed from 'small' to match tab buttons
        color: selectedItem === itemData ? '#ff8800' : '#8888ff',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onSelect(itemData));
      uiElements.push(selectBtn);
    });

    if (selectedItem) {
      const detailY = height / 2 + 80;
      const cost = ForgingSystem.getRepairCost(selectedItem.item);

      if (cost) {
        const detailPanel = this.add.rectangle(width / 2, detailY, 700, 120, 0x1a1a2e).setOrigin(0.5);
        uiElements.push(detailPanel);

        const detailTitle = this.add.text(width / 2, detailY - 50, `Repair ${ForgingSystem.getItemDisplayName(selectedItem.item)}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.medium,
          color: '#f0a020',
        }).setOrigin(0.5);
        uiElements.push(detailTitle);

        const detailsText = this.add.text(width / 2, detailY - 20, 
          `Durability: ${Math.floor(selectedItem.item.durability ?? 100)}/${selectedItem.item.maxDurability ?? 100} → ${selectedItem.item.maxDurability ?? 100}/${selectedItem.item.maxDurability ?? 100}\nPay ${cost.aa} AA  OR  ${cost.ca} CA`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#ffffff',
          align: 'center',
        }).setOrigin(0.5);
        uiElements.push(detailsText);

        const repairAABtn = this.createButton(width / 2 - 180, detailY + 40, `Pay ${cost.aa} AA`, () => {
          this.attemptRepair(selectedItem!, 'AA');
          onSelect(null);
        });
        uiElements.push(repairAABtn);

        const repairCABtn = this.createButton(width / 2 + 180, detailY + 40, `Pay ${cost.ca} CA`, () => {
          this.attemptRepair(selectedItem!, 'CA');
          onSelect(null);
        });
        uiElements.push(repairCABtn);
      }
    }
  }

  private async attemptRepair(itemData: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null; inventoryIndex?: number }, currency: 'AA' | 'CA'): Promise<void> {
    const player = this.gameState.getPlayer();
    const cost = ForgingSystem.getRepairCost(itemData.item);
    
    if (cost.aa === 0 && cost.ca === 0) {
      this.showMessage('Item is already at full durability!');
      return;
    }
    
    if (currency === 'AA') {
      if (player.arcaneAsh < cost.aa) {
        this.showMessage(`Insufficient funds! Need ${cost.aa} AA`);
        return;
      }
    } else {
      if (player.crystallineAnimus < cost.ca) {
        this.showMessage(`Insufficient funds! Need ${cost.ca} CA`);
        return;
      }
    }

    let itemLocation: 'equipment' | 'inventory';
    let itemIndex: number | undefined;
    let slotName: string | undefined;

    if (itemData.equippedSlot) {
      itemLocation = 'equipment';
      slotName = itemData.equippedSlot;
    } else if (itemData.inventoryIndex !== undefined) {
      itemLocation = 'inventory';
      itemIndex = itemData.inventoryIndex;
    } else {
      itemIndex = player.inventory.findIndex(i => i === itemData.item);
      if (itemIndex === -1) {
        this.showMessage('Item not found!');
        return;
      }
      itemLocation = 'inventory';
    }

    try {
      const response = await fetch('/api/repair/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          itemLocation,
          itemIndex,
          slotName,
          currency,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        this.showMessage(error.message || 'Repair failed!');
        return;
      }

      const result = await response.json();

      if (result.newArcaneAsh !== undefined) {
        player.arcaneAsh = result.newArcaneAsh;
      }
      if (result.newCrystallineAnimus !== undefined) {
        player.crystallineAnimus = result.newCrystallineAnimus;
      }

      itemData.item.durability = result.newDurability;
      
      if (itemData.equippedSlot) {
        player.equipment[itemData.equippedSlot] = itemData.item;
      }
      
      this.gameState.updatePlayer(player);
      
      // Save state after repair to ensure consistency
      this.gameState.saveToServer();
      
      this.showMessage(result.message);
      this.updatePlayerDisplay();
    } catch (error) {
      console.error('Repair error:', error);
      this.showMessage('Repair failed - please try again');
    }
  }

  private showRepairAllConfirmation(repairableItems: Array<{ item: InventoryItem; equippedSlot: keyof PlayerEquipment | null }>): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    let totalAA = 0;
    let totalCA = 0;
    
    for (const itemData of repairableItems) {
      const cost = ForgingSystem.getRepairCost(itemData.item);
      totalAA += cost.aa;
      totalCA += cost.ca;
    }

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.9).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 500, 300, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 100, 'Repair All Items', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(title);

    const itemCountText = this.add.text(width / 2, height / 2 - 50, `${repairableItems.length} items need repair`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5);
    uiElements.push(itemCountText);

    const costText = this.add.text(width / 2, height / 2, `Total Cost:\n${totalAA} AA  OR  ${totalCA.toFixed(2)} CA`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffff88',
      align: 'center',
    }).setOrigin(0.5);
    uiElements.push(costText);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
    };

    const repairAllAA = this.createButton(width / 2 - 180, height / 2 + 80, `Pay ${totalAA} AA`, () => {
      this.executeRepairAll(repairableItems, 'AA');
      destroyAll();
    });
    uiElements.push(repairAllAA);

    const repairAllCA = this.createButton(width / 2 + 180, height / 2 + 80, `Pay ${totalCA.toFixed(2)} CA`, () => {
      this.executeRepairAll(repairableItems, 'CA');
      destroyAll();
    });
    uiElements.push(repairAllCA);

    const cancelBtn = this.createButton(width / 2, height / 2 + 130, 'Cancel', () => {
      destroyAll();
    });
    uiElements.push(cancelBtn);
  }

  private async executeRepairAll(repairableItems: Array<{ item: InventoryItem; equippedSlot: keyof PlayerEquipment | null; inventoryIndex?: number }>, currency: 'AA' | 'CA'): Promise<void> {
    const player = this.gameState.getPlayer();
    
    let totalAA = 0;
    let totalCA = 0;
    
    for (const itemData of repairableItems) {
      const cost = ForgingSystem.getRepairCost(itemData.item);
      totalAA += cost.aa;
      totalCA += cost.ca;
    }

    if (currency === 'AA') {
      if (player.arcaneAsh < totalAA) {
        this.showMessage(`Insufficient funds! Need ${totalAA} AA`);
        return;
      }
    } else {
      if (player.crystallineAnimus < totalCA) {
        this.showMessage(`Insufficient funds! Need ${totalCA.toFixed(2)} CA`);
        return;
      }
    }

    const items = repairableItems.map((itemData, idx) => {
      if (itemData.equippedSlot) {
        return { location: 'equipment', slotName: itemData.equippedSlot };
      } else if (itemData.inventoryIndex !== undefined) {
        return { location: 'inventory', index: itemData.inventoryIndex };
      } else {
        const index = player.inventory.findIndex(i => i === itemData.item);
        return { location: 'inventory', index };
      }
    });

    try {
      const response = await fetch('/api/repair/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items, currency }),
      });

      if (!response.ok) {
        const error = await response.json();
        this.showMessage(error.message || 'Bulk repair failed!');
        return;
      }

      const result = await response.json();

      if (result.newArcaneAsh !== undefined) {
        player.arcaneAsh = result.newArcaneAsh;
      }
      if (result.newCrystallineAnimus !== undefined) {
        player.crystallineAnimus = result.newCrystallineAnimus;
      }

      for (const itemData of repairableItems) {
        itemData.item.durability = itemData.item.maxDurability || 100;
        if (itemData.equippedSlot) {
          player.equipment[itemData.equippedSlot] = itemData.item;
        }
      }

      this.gameState.updatePlayer(player);
      
      // Save state after bulk repair to ensure consistency
      this.gameState.saveToServer();
      
      this.showMessage(result.message);
      this.updatePlayerDisplay();
      
      this.openForge();
    } catch (error) {
      console.error('Bulk repair error:', error);
      this.showMessage('Bulk repair failed - please try again');
    }
  }

  private async attemptForging(itemData: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null; inventoryIndex?: number }): Promise<void> {
    const player = this.gameState.getPlayer();
    const targetLevel = (itemData.item.enhancementLevel || 0) + 1;
    const cost = ForgingSystem.getForgingCost(targetLevel);
    
    if (!cost) {
      this.showMessage('Invalid forging level!');
      return;
    }
    
    if (player.arcaneAsh < cost.aa || player.crystallineAnimus < cost.ca) {
      this.showMessage(`Insufficient funds! Need ${cost.aa} AA and ${cost.ca} CA`);
      return;
    }

    // Determine item location for server API
    let itemLocation: 'equipment' | 'inventory' | 'footlocker';
    let itemIndex: number | undefined;
    let slotName: string | undefined;

    console.log('[FORGE CLIENT] itemData:', itemData);
    console.log('[FORGE CLIENT] equippedSlot:', itemData.equippedSlot);

    if (itemData.equippedSlot) {
      itemLocation = 'equipment';
      slotName = itemData.equippedSlot;
      console.log('[FORGE CLIENT] Using equipment location, slotName:', slotName);
    } else if (itemData.inventoryIndex !== undefined) {
      itemLocation = 'inventory';
      itemIndex = itemData.inventoryIndex;
    } else {
      // Fallback: find item in inventory by reference
      itemIndex = player.inventory.findIndex(i => i === itemData.item);
      if (itemIndex === -1) {
        this.showMessage('Item not found!');
        return;
      }
      itemLocation = 'inventory';
    }

    try {
      const requestBody = {
        itemLocation,
        itemIndex,
        slotName,
      };
      console.log('[FORGE CLIENT] Sending request:', requestBody);
      
      const response = await fetch('/api/forge/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        this.showMessage(error.message || 'Forging failed!');
        return;
      }

      const result = await response.json();

      // Update local player state with server-authoritative values
      if (result.newArcaneAsh !== undefined) {
        player.arcaneAsh = result.newArcaneAsh;
      }
      if (result.newCrystallineAnimus !== undefined) {
        player.crystallineAnimus = result.newCrystallineAnimus;
      }

      if (result.destroyed) {
        // Item was destroyed - reload the save to get updated state
        const saveData = await ApiClient.loadGame();
        if (saveData) {
          this.gameState.loadFromObject(saveData);
        }
      } else {
        // Update the item in local state
        itemData.item.enhancementLevel = result.newLevel;
        if (result.newDurability !== undefined) {
          itemData.item.durability = result.newDurability;
        }
        if (result.newMaxDurability !== undefined) {
          itemData.item.maxDurability = result.newMaxDurability;
        }
        if (result.shinyCreated) {
          itemData.item.isShiny = true;
        }

        if (itemData.equippedSlot) {
          player.equipment[itemData.equippedSlot] = itemData.item;
        }
      }

      this.gameState.updatePlayer(player);
      
      // Save state after forging to ensure consistency
      this.gameState.saveToServer();
      
      this.showMessage(result.message);
      this.updatePlayerDisplay();

    } catch (error) {
      console.error('Error calling forge API:', error);
      this.showMessage('Failed to connect to server for forging!');
    }
  }

  private openInn(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const REST_COST = 0; // Free for testing

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 750, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    // Header layout with unified design pattern
    const headerBaseY = height / 2 - 240;
    const verticalGap = 65;

    // Row 1: Title
    const title = this.add.text(width / 2, headerBaseY, 'The Weary Traveler', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#6699ff',
      resolution: 2,
    }).setOrigin(0.5);
    uiElements.push(title);

    // Row 2: Subtitle quote
    const innkeeperText = this.add.text(width / 2, headerBaseY + verticalGap, '"Welcome, traveler. Rest your weary bones."', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#cccccc',
      fontStyle: 'italic',
      resolution: 2,
    }).setOrigin(0.5);
    uiElements.push(innkeeperText);

    // Content area starts after header
    const contentY = headerBaseY + (verticalGap * 2) + 40;

    // Pad numbers to ensure consistent width for alignment
    const healthStr = `${player.health} / ${player.maxHealth}`.padEnd(9);
    const staminaStr = `${player.stamina} / ${player.maxStamina}`.padEnd(9);
    
    const playerStatusText = this.add.text(width / 2, contentY, 
      `Current Health : ${healthStr}\n` +
      `Current Stamina: ${staminaStr}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      align: 'center',
      resolution: 2,
    }).setOrigin(0.5);
    uiElements.push(playerStatusText);

    const costText = this.add.text(width / 2, contentY + 50, 
      `Rest Cost: FREE (Testing Mode)`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#88ff88',
      resolution: 2,
    }).setOrigin(0.5);
    uiElements.push(costText);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'inn';

    const isFullyRested = player.health >= player.maxHealth && player.stamina >= player.maxStamina;

    if (isFullyRested) {
      const restBtn = this.createButton(width / 2, height / 2 + 140, 'Rest and Restore', () => {});
      const btnBg = restBtn.getAt(0) as Phaser.GameObjects.Rectangle;
      btnBg.setFillStyle(0x666666);
      btnBg.disableInteractive();
      uiElements.push(restBtn);
    } else {
      const restBtn = this.createButton(width / 2, height / 2 + 140, 'Rest and Restore', () => {
        player.health = player.maxHealth;
        player.stamina = player.maxStamina;
        this.gameState.updatePlayer(player);
        this.showMessage('You feel refreshed and restored!');
        this.updatePlayerDisplay();
        destroyAll();
      });
      uiElements.push(restBtn);
    }

    const closeBtn = this.createButton(width / 2, height / 2 + 200, 'Leave', () => {
      destroyAll();
    });
    uiElements.push(closeBtn);
  }

  private async openSoulbinding(): Promise<void> {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    // Load current soulbound slots from server
    const soulboundSlots = await ApiClient.getSoulboundSlots();
    const selectedSlots = new Set<string>(soulboundSlots);

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 750, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    // Header layout with unified design pattern
    const headerBaseY = height / 2 - 240;
    const verticalGap = 65;

    // Row 1: Title
    const title = this.add.text(width / 2, headerBaseY, 'Garthek the Stitcher', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#9944cc',
    }).setOrigin(0.5);
    uiElements.push(title);

    // Row 2: Quote
    const subtitle = this.add.text(width / 2, headerBaseY + verticalGap, 
      '"I can bind your equipment to your very soul.\nSoulbound items will return to you upon death."', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#cccccc',
      fontStyle: 'italic',
      align: 'center',
    }).setOrigin(0.5);
    uiElements.push(subtitle);

    // Row 3: Instructions
    const infoText = this.add.text(width / 2, headerBaseY + (verticalGap * 2), 
      `Select equipment slots to bind (max 3 slots)\nCost: 1 CA per item  |  Your CA: ${player.crystallineAnimus}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffcc00',
      align: 'center',
    }).setOrigin(0.5);
    uiElements.push(infoText);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'soulbinding' as any;

    // Define equipment slots (must match PlayerEquipment interface)
    const slots: Array<{ key: keyof PlayerEquipment }> = [
      { key: 'mainHand' },
      { key: 'offHand' },
      { key: 'helmet' },
      { key: 'chest' },
      { key: 'legs' },
      { key: 'boots' },
      { key: 'shoulders' },
      { key: 'cape' },
    ];

    // Content area - centered 2-column grid with proper spacing
    const startY = headerBaseY + (verticalGap * 2) + 50;
    const rowSpacing = 45;
    const colSpacing = 320;
    const slotCheckboxes: Map<string, Phaser.GameObjects.Container> = new Map();

    slots.forEach((slot, index) => {
      const slotKey = slot.key;
      const row = index % 4;
      const col = Math.floor(index / 4);
      const posX = width / 2 - colSpacing / 2 + col * colSpacing;
      const y = startY + row * rowSpacing;

      const item = player.equipment[slotKey];
      const isEquipped = !!item;
      const isBound = selectedSlots.has(slotKey);

      // Checkbox
      const checkbox = this.add.rectangle(posX - 120, y, 20, 20, isBound ? 0x44ff44 : 0x444444)
        .setStrokeStyle(2, 0xffffff);

      let displayName = '[Empty]';
      let itemColor = '#666666';
      
      if (isEquipped && item) {
        const itemData = ItemDatabase.getItem(item.itemId);
        const baseName = itemData ? itemData.name : item.itemId;
        const enhancement = item.enhancementLevel || 0;
        displayName = enhancement > 0 ? `${baseName} +${enhancement}` : baseName;
        itemColor = ItemColorUtil.getItemColor(enhancement, item.isShiny);
      }

      const slotText = this.add.text(posX - 95, y, displayName, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: itemColor,
      }).setOrigin(0, 0.5);

      const container = this.add.container(0, 0, [checkbox, slotText]);
      
      if (isEquipped) {
        container.setInteractive(
          new Phaser.Geom.Rectangle(posX - 130, y - 15, 260, 35),
          Phaser.Geom.Rectangle.Contains
        );
        container.on('pointerdown', () => {
          if (selectedSlots.has(slotKey)) {
            selectedSlots.delete(slotKey);
            checkbox.setFillStyle(0x444444);
          } else {
            if (selectedSlots.size < 3) {
              selectedSlots.add(slotKey);
              checkbox.setFillStyle(0x44ff44);
            } else {
              this.showMessage('Maximum 3 slots can be soulbound');
            }
          }
        });
      }

      slotCheckboxes.set(slotKey, container);
      uiElements.push(container);
    });

    // Save button
    const saveBtn = this.createButton(width / 2 - 100, height / 2 + 220, 'Save Bindings', async () => {
      const result = await ApiClient.setSoulboundSlots(Array.from(selectedSlots));
      if (result.success) {
        const cost = result.cost || 0;
        if (cost > 0 && result.newCA !== undefined) {
          // Sync CA from server (authoritative)
          this.gameState.updatePlayer({ crystallineAnimus: result.newCA });
          this.showMessage(`Soul bindings saved! Cost: ${cost} CA`);
        } else {
          this.showMessage('Soul bindings saved successfully');
        }
        
        // Save state after soulbinding to ensure consistency
        this.gameState.saveToServer();
        
        destroyAll();
      } else {
        this.showMessage(result.message || 'Failed to save bindings');
      }
    });
    uiElements.push(saveBtn);

    // Close button
    const closeBtn = this.createButton(width / 2 + 100, height / 2 + 220, 'Close', () => {
      destroyAll();
    });
    uiElements.push(closeBtn);
  }

  private async openHallsOfVirtue(): Promise<void> {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    // Dark overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8)
      .setOrigin(0).setDepth(1000);
    uiElements.push(overlay);

    // Main panel
    const panel = this.add.rectangle(width / 2, height / 2, 900, 600, 0x1a1a2e, 1)
      .setOrigin(0.5).setDepth(1001);
    uiElements.push(panel);

    // Title
    const title = this.add.text(width / 2, height / 2 - 270, 'Halls of Virtue', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1002);
    uiElements.push(title);

    // Divider
    const divider = this.add.line(width / 2, height / 2, 0, -200, 0, 200, 0x444444, 1)
      .setOrigin(0.5).setDepth(1002);
    uiElements.push(divider);

    // Left Panel - Returned Items
    const leftTitle = this.add.text(width / 2 - 225, height / 2 - 200, 'Returned Items', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#44ff44',
    }).setOrigin(0.5).setDepth(1002);
    uiElements.push(leftTitle);

    // Fetch returned items
    const returnedItems = await ApiClient.getPendingReturns();
    
    if (returnedItems.length === 0) {
      const noItems = this.add.text(width / 2 - 225, height / 2, 'No items to claim', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#888888',
      }).setOrigin(0.5).setDepth(1002);
      uiElements.push(noItems);
    } else {
      let yPos = height / 2 - 150;
      returnedItems.slice(0, 5).forEach((loot: any) => {
        const itemCount = loot.items?.length || 0;
        const text = this.add.text(width / 2 - 400, yPos, 
          `${itemCount} items from ${loot.returner_name}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#cccccc',
        }).setDepth(1002);
        
        const claimBtn = this.createButton(width / 2 - 220, yPos, 'Claim', async () => {
          const result = await ApiClient.claimReturnedLoot(loot.id);
          if (result) {
            this.showMessage(`Claimed ${itemCount} items!`);
            // Refresh the UI
            uiElements.forEach(el => el.destroy());
            this.openHallsOfVirtue();
          }
        }).setDepth(1002);
        
        uiElements.push(text, claimBtn);
        yPos += 60;
      });
    }

    // Right Panel - Karma Leaderboard
    const rightTitle = this.add.text(width / 2 + 225, height / 2 - 200, 'Karma Leaderboard', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffd700',
    }).setOrigin(0.5).setDepth(1002);
    uiElements.push(rightTitle);

    // Fetch leaderboard
    const leaderboard = await ApiClient.getKarmaLeaderboard(10);
    
    let lbYPos = height / 2 - 150;
    leaderboard.slice(0, 10).forEach((entry: any, index: number) => {
      const rankColor = index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#cccccc';
      const text = this.add.text(width / 2 + 150, lbYPos, 
        `${index + 1}. ${entry.playerName || 'Anonymous'}: ${entry.totalItems} items`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: rankColor,
      }).setDepth(1002);
      uiElements.push(text);
      lbYPos += 35;
    });

    // Close button
    const closeBtnHalls = this.createButton(width / 2, height / 2 + 260, 'Close', () => {
      destroyAll();
    }).setDepth(1002);
    uiElements.push(closeBtnHalls);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.menuState = 'none';
    this.currentMenuCloseFunction = destroyAll;

    // ESC key support
    const escHandler = () => {
      destroyAll();
    };
    this.escKey.once('down', escHandler);
  }

  private async openMageWarpNexus(): Promise<void> {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 800, 600, 0x1a1a2e).setOrigin(0.5);
    const panelBorder = this.add.rectangle(width / 2, height / 2, 804, 604, 0x6644aa).setOrigin(0.5);
    panelBorder.setDepth(999);
    panel.setDepth(1000);
    uiElements.push(overlay, panelBorder, panel);

    // Title
    const title = this.add.text(width / 2, height / 2 - 260, 'Mage Warp Nexus', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#aa88ff',
      resolution: 2,
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(title);

    // Subtitle
    const subtitle = this.add.text(width / 2, height / 2 - 220, '"The ancient pathways between realms..."', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#888888',
      fontStyle: 'italic',
      resolution: 2,
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(subtitle);

    // Loading text
    const loadingText = this.add.text(width / 2, height / 2, 'Loading zone progress...', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#888888',
      resolution: 2,
    }).setOrigin(0.5).setDepth(1002);
    uiElements.push(loadingText);

    // Fetch progress from server (server-authoritative)
    const zoneProgress = await ApiClient.getZoneProgress();
    loadingText.destroy();

    // Get player progress data from server or use defaults
    const delvesCompletedByTier = zoneProgress?.delvesCompletedByTier || player.delvesCompletedByTier || {
      tier1: 0, tier2: 0, tier3: 0, tier4: 0, tier5: 0
    };
    const discoveredZones = zoneProgress?.discoveredZones || player.discoveredZones || ['roboka'];

    // Sync to local player state
    player.delvesCompletedByTier = delvesCompletedByTier;
    player.discoveredZones = discoveredZones;
    this.gameState.updatePlayer(player);

    // Zone portal grid - 2x2 layout for T2-T5 zones
    const unlockableZones = getUnlockableZones(); // T2-T5 zones
    const gridStartX = width / 2 - 180;
    const gridStartY = height / 2 - 100;
    const cellWidth = 360;
    const cellHeight = 180;

    unlockableZones.forEach((zone, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = gridStartX + col * cellWidth;
      const y = gridStartY + row * cellHeight;

      const progress = getDelveProgress(zone, delvesCompletedByTier);
      const isUnlockable = isZoneUnlockable(zone, delvesCompletedByTier);
      const isDiscovered = discoveredZones.includes(zone.id);

      // Zone portal frame
      const portalBg = this.add.rectangle(x, y, 160, 140, 0x2a2a4e).setDepth(1001);
      const portalFrame = this.add.rectangle(x, y, 164, 144, isDiscovered ? 0x44ff44 : isUnlockable ? 0xffaa00 : 0x444466).setDepth(1000);
      uiElements.push(portalFrame, portalBg);

      // Zone name and tier
      const zoneName = this.add.text(x, y - 45, zone.name, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: isDiscovered ? '#44ff44' : isUnlockable ? '#ffaa00' : '#888888',
        resolution: 2,
      }).setOrigin(0.5).setDepth(1002);
      uiElements.push(zoneName);

      const tierText = this.add.text(x, y - 25, `Tier ${zone.tier}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#aaaaaa',
        resolution: 2,
      }).setOrigin(0.5).setDepth(1002);
      uiElements.push(tierText);

      // Status text
      let statusText: string;
      let statusColor: string;

      if (isDiscovered) {
        statusText = 'Discovered';
        statusColor = '#44ff44';
      } else if (isUnlockable) {
        statusText = 'Find the Rift!';
        statusColor = '#ffaa00';
      } else {
        statusText = `${progress.completed}/${progress.required} delves`;
        statusColor = '#888888';
      }

      const status = this.add.text(x, y + 10, statusText, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: statusColor,
        resolution: 2,
      }).setOrigin(0.5).setDepth(1002);
      uiElements.push(status);

      // Portal fee display for discovered zones
      if (isDiscovered) {
        const feeAA = zone.portalFee.arcaneAsh;
        const feeCA = zone.portalFee.crystallineAnimus;
        const feeText = feeCA > 0 ? `${feeAA} AA + ${feeCA} CA` : `${feeAA} AA`;
        
        const fee = this.add.text(x, y + 35, feeText, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: '#ffcc00',
          resolution: 2,
        }).setOrigin(0.5).setDepth(1002);
        uiElements.push(fee);

        // Warp button
        const canAfford = player.arcaneAsh >= feeAA && player.crystallineAnimus >= feeCA;
        const warpBtn = this.add.rectangle(x, y + 55, 80, 24, canAfford ? 0x44aa44 : 0x666666)
          .setDepth(1002);
        
        if (canAfford) {
          warpBtn.setInteractive({ useHandCursor: true })
            .on('pointerover', () => warpBtn.setFillStyle(0x55bb55))
            .on('pointerout', () => warpBtn.setFillStyle(0x44aa44))
            .on('pointerdown', () => this.handleZoneWarp(zone, destroyAll));
        }
        
        const warpLabel = this.add.text(x, y + 55, 'Warp', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
          color: canAfford ? '#ffffff' : '#888888',
          resolution: 2,
        }).setOrigin(0.5).setDepth(1003);
        
        uiElements.push(warpBtn, warpLabel);
      }
    });

    // Current location indicator
    const currentZone = this.add.text(width / 2, height / 2 + 220, 'Current Location: Roboka (Tier 1)', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#88ff88',
      resolution: 2,
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(currentZone);

    // Close button
    const closeBtn = this.createButton(width / 2, height / 2 + 260, 'Close', () => {
      destroyAll();
    });
    closeBtn.setDepth(1002);
    uiElements.push(closeBtn);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.menuState = 'none';
    this.currentMenuCloseFunction = destroyAll;

    // ESC key support
    const escHandler = () => {
      destroyAll();
    };
    this.escKey.once('down', escHandler);
  }

  private async handleZoneWarp(zone: ZoneConfig, closeMenu: () => void): Promise<void> {
    const player = this.gameState.getPlayer();
    const feeAA = zone.portalFee.arcaneAsh;
    const feeCA = zone.portalFee.crystallineAnimus;

    // Double-check can afford
    if (player.arcaneAsh < feeAA || player.crystallineAnimus < feeCA) {
      this.showMessage('Not enough currency for warp!');
      return;
    }

    // For now, just show a message since other zones aren't built yet
    this.showMessage(`Zone ${zone.name} coming soon!`);
    
    // In the future, this will:
    // 1. Call server API to deduct currency
    // 2. Transition to the appropriate zone scene
    // closeMenu();
    // this.scene.start('ZoneScene', { zoneId: zone.id });
  }
}
