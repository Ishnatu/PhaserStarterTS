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

export class TownScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private statsPanel!: StatsPanel;
  private menuState: 'none' | 'inventory' | 'equipment' | 'shop' | 'forge' | 'inn' | 'footlocker' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('TownScene');
  }

  preload() {
    this.load.image('coin-aa', '/assets/ui/currency/arcane-ash-coin.png');
    this.load.image('coin-ca', '/assets/ui/currency/crystalline-animus-coin.png');
    this.load.image('equipment-panel', '/assets/ui/equipment-panel.png');
    this.load.image('blacksmith-button', '/assets/ui/shop-buttons/blacksmith-button.png');
    this.load.image('garthek-button', '/assets/ui/shop-buttons/garthek-button.png');
    this.load.image('evasion-icon', '/assets/ui/evasion-icon.png');
    this.load.image('shield-icon', '/assets/ui/shield-icon.png');
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
    this.gameState.updatePlayer(player);

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

    this.createNPCs();

    const exploreBtn = this.createButton(width / 2, height - 100, 'Venture Into the Wilds', () => {
      const robokaX = 1550;
      const robokaY = 1550;
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
    const npcSpacing = 90;

    const npcs = [
      { name: 'Blacksmith', color: 0xff6633, description: 'Forges and upgrades equipment', sprite: 'blacksmith-button' },
      { name: 'Merchant', color: 0x66cc66, description: 'Buys and sells goods' },
      { name: 'Innkeeper', color: 0x6699ff, description: 'Provides rest and healing' },
      { name: 'Vault Keeper', color: 0x88ddff, description: 'Manages your storage footlocker' },
      { name: 'Garthek', color: 0x9944cc, description: 'The Stitcher - Binds items to your soul', sprite: 'garthek-button' },
      { name: 'Keeper of Virtue', color: 0xffd700, description: 'Reclaim returned items and view karma' },
      { name: 'Quest Giver', color: 0xffcc33, description: 'Offers missions and lore' },
      { name: 'Gem Expert', color: 0xcc66ff, description: 'Soulbinds Voidtouched Gems' },
      { name: 'Marketplace', color: 0xff9966, description: 'Player trading hub' },
    ];

    const columns = 3;
    const startX = width / 2 - (columns - 1) * npcSpacing;

    npcs.forEach((npc, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = startX + col * (npcSpacing * 2);
      const y = npcY + row * 145;  // Increased from 100 to 145 for 120px avatars + label spacing

      let npcVisual: Phaser.GameObjects.GameObject;

      if (npc.sprite) {
        const npcSprite = this.add.image(x, y, npc.sprite)
          .setDisplaySize(120, 120)  // Increased for better readability
          .setInteractive({ useHandCursor: true })
          .on('pointerover', () => npcSprite.setTint(0xdddddd))
          .on('pointerout', () => npcSprite.clearTint())
          .on('pointerdown', () => this.interactWithNPC(npc.name, npc.description));
        npcVisual = npcSprite;
      } else {
        const npcBox = this.add.rectangle(x, y, 120, 120, npc.color)  // Increased for better readability
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
    const panel = this.add.rectangle(width / 2, height / 2, 700, 500, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 220, `Inventory (${player.inventory.reduce((sum, item) => sum + item.quantity, 0)}/${player.inventorySlots})`, {
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
      
      // Build item label with durability for equipment
      let displayName = item.name;
      if (invItem.enhancementLevel && invItem.enhancementLevel > 0) {
        displayName += ` +${invItem.enhancementLevel}`;
      }
      displayName += ` x${invItem.quantity}`;
      
      const weapon = ItemDatabase.getWeapon(invItem.itemId);
      const armor = ItemDatabase.getArmor(invItem.itemId);
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemLabel = this.add.text(width / 2 - 320, y, displayName, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
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
        
        const durabilityLabel = this.add.text(width / 2 - 100, y, `[${Math.floor(currentDurability)}/${maxDurability}]`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: durabilityColor,
        });
        uiElements.push(durabilityLabel);
      }

      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (weapon) {
        if (weapon.twoHanded) {
          const equipBtn = this.add.text(width / 2 + 100, y, '[Equip]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            });
          uiElements.push(equipBtn);
        } else {
          const equipMHBtn = this.add.text(width / 2 + 70, y, '[Equip MH]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            });
          uiElements.push(equipMHBtn);

          const equipOHBtn = this.add.text(width / 2 + 150, y, '[Equip OH]', {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'offHand');
              destroyAll();
              this.openInventory();
            });
          uiElements.push(equipOHBtn);
        }
      } else if (armor) {
        const equipBtn = this.add.text(width / 2 + 100, y, '[Equip]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#88ff88',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.equipItemFromInventory(invItem.itemId);
            destroyAll();
            this.openInventory();
          });
        uiElements.push(equipBtn);
      }

      if (isPotion) {
        const useBtn = this.add.text(width / 2 + 120, y, '[Use]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#8888ff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.usePotion(invItem.itemId);
            destroyAll();
            this.openInventory();
          });
        uiElements.push(useBtn);
      }

      const storeBtn = this.add.text(width / 2 + 200, y, '[Store]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffaa88',
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

    if (potion.type === 'health') {
      player.health = Math.min(player.maxHealth, player.health + amount);
      this.showMessage(`Used ${potion.name}! Restored ${amount} HP`);
    } else if (potion.type === 'stamina') {
      player.stamina = Math.min(player.maxStamina, player.stamina + amount);
      this.showMessage(`Used ${potion.name}! Restored ${amount} Stamina`);
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

  private openFootlocker(footlockerScroll: number = 0, inventoryScroll: number = 0): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 850, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 250, 'Vault Keeper - Storage Footlocker', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#88ddff',
    }).setOrigin(0.5);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'footlocker';

    const footlockerCount = player.footlocker.reduce((sum, item) => sum + item.quantity, 0);
    const inventoryCount = player.inventory.reduce((sum, item) => sum + item.quantity, 0);

    const footlockerTitle = this.add.text(width / 2 - 300, height / 2 - 210, `Footlocker (${footlockerCount}/${player.footlockerSlots})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#88ddff',
    });
    uiElements.push(footlockerTitle);

    const inventoryTitle = this.add.text(width / 2 + 100, height / 2 - 210, `Inventory (${inventoryCount}/${player.inventorySlots})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#f0a020',
    });
    uiElements.push(inventoryTitle);

    const itemsStartY = height / 2 - 180;
    const itemHeight = 28;
    const maxDisplay = 14;

    const footlockerItems = player.footlocker;
    const clampedFootlockerScroll = Math.max(0, Math.min(footlockerScroll, Math.max(0, footlockerItems.length - maxDisplay)));
    const footlockerStart = clampedFootlockerScroll;
    const footlockerEnd = Math.min(footlockerStart + maxDisplay, footlockerItems.length);

    for (let i = footlockerStart; i < footlockerEnd; i++) {
      const invItem = footlockerItems[i];
      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) continue;

      const displayIndex = i - footlockerStart;
      const y = itemsStartY + displayIndex * itemHeight;
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemLabel = this.add.text(width / 2 - 400, y, `${item.name} x${invItem.quantity}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
      });
      uiElements.push(itemLabel);

      const retrieveBtn = this.add.text(width / 2 - 120, y, '[Retrieve]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#88ff88',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.gameState.moveFromFootlocker(invItem.itemId, 1)) {
            this.showMessage(`Retrieved ${item.name}`);
            destroyAll();
            this.openFootlocker(clampedFootlockerScroll, clampedInventoryScroll);
          } else {
            this.showMessage('Inventory is full!');
          }
        });
      uiElements.push(retrieveBtn);
    }

    if (footlockerItems.length === 0) {
      const emptyText = this.add.text(width / 2 - 300, itemsStartY, 'Footlocker is empty', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#666666',
      });
      uiElements.push(emptyText);
    } else {
      if (clampedFootlockerScroll > 0) {
        const upBtn = this.add.text(width / 2 - 400, height / 2 - 210, '▲', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#88ddff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            destroyAll();
            this.openFootlocker(clampedFootlockerScroll - 1, inventoryScroll);
          });
        uiElements.push(upBtn);
      }
      if (footlockerEnd < footlockerItems.length) {
        const downBtn = this.add.text(width / 2 - 400, height / 2 + 200, '▼', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#88ddff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            destroyAll();
            this.openFootlocker(clampedFootlockerScroll + 1, inventoryScroll);
          });
        uiElements.push(downBtn);
      }
    }

    const inventoryItems = player.inventory;
    const clampedInventoryScroll = Math.max(0, Math.min(inventoryScroll, Math.max(0, inventoryItems.length - maxDisplay)));
    const inventoryStart = clampedInventoryScroll;
    const inventoryEnd = Math.min(inventoryStart + maxDisplay, inventoryItems.length);

    for (let i = inventoryStart; i < inventoryEnd; i++) {
      const invItem = inventoryItems[i];
      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) continue;

      const displayIndex = i - inventoryStart;
      const y = itemsStartY + displayIndex * itemHeight;
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemLabel = this.add.text(width / 2 + 100, y, `${item.name} x${invItem.quantity}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
      });
      uiElements.push(itemLabel);

      const storeBtn = this.add.text(width / 2 + 350, y, '[Store]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffaa44',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.storeItem(invItem.itemId);
          destroyAll();
          this.openFootlocker(clampedFootlockerScroll, clampedInventoryScroll);
        });
      uiElements.push(storeBtn);
    }

    if (inventoryItems.length === 0) {
      const emptyText = this.add.text(width / 2 + 100, itemsStartY, 'Inventory is empty', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#666666',
      });
      uiElements.push(emptyText);
    } else {
      if (clampedInventoryScroll > 0) {
        const upBtn = this.add.text(width / 2 + 100, height / 2 - 210, '▲', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#f0a020',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            destroyAll();
            this.openFootlocker(clampedFootlockerScroll, clampedInventoryScroll - 1);
          });
        uiElements.push(upBtn);
      }
      if (inventoryEnd < inventoryItems.length) {
        const downBtn = this.add.text(width / 2 + 100, height / 2 + 200, '▼', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#f0a020',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            destroyAll();
            this.openFootlocker(clampedFootlockerScroll, clampedInventoryScroll + 1);
          });
        uiElements.push(downBtn);
      }
    }

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

      const slotHitArea = this.add.rectangle(slotX, slotY, hitAreaSize, hitAreaSize, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          selectedSlot = { key: gridSlot.key!, x: slotX, y: slotY };
          updateInfoDisplay();
        });
      uiElements.push(slotHitArea);

      const equipped = player.equipment[gridSlot.key];
      
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

    const renderShop = () => {
      uiElements.forEach(el => el.destroy());
      uiElements.length = 0;

      const player = this.gameState.getPlayer();

      const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
      const panel = this.add.rectangle(width / 2, height / 2, 750, 550, 0x2a2a3e).setOrigin(0.5);
      uiElements.push(overlay, panel);

      const title = this.add.text(width / 2, height / 2 - 250, 'Merchant\'s Shop', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.large,
        color: '#f0a020',
      }).setOrigin(0.5);
      uiElements.push(title);

      const currencyDisplay = CurrencyDisplay.createInlineCurrency(
        this,
        width / 2,
        height / 2 - 210,
        player.arcaneAsh,
        player.crystallineAnimus,
        'small'
      );
      currencyDisplay.setScrollFactor(0);
      currencyDisplay.x -= currencyDisplay.getBounds().width / 2;
      uiElements.push(currencyDisplay);

      const tabY = height / 2 - 170;
      const tabSpacing = 120;

      const weaponsTab = this.add.text(width / 2 - tabSpacing, tabY, 'Weapons', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
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
        fontSize: FONTS.size.small,
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
        fontSize: FONTS.size.small,
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

      const itemsStartY = height / 2 - 130;
      const itemHeight = 28;

      shopItems.forEach((shopItem, index) => {
        const item = ItemDatabase.getItem(shopItem.itemId);
        if (!item) return;

        const y = itemsStartY + index * itemHeight;

        const itemColor = ItemColorUtil.getItemColor(undefined, undefined);
        const itemLabel = this.add.text(width / 2 - 340, y, item.name, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: itemColor,
        });
        uiElements.push(itemLabel);

        const currencyLabel = shopItem.currency === 'AA' ? 'AA' : 'CA';
        const priceLabel = this.add.text(width / 2 + 80, y, `${shopItem.price} ${currencyLabel}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: shopItem.currency === 'AA' ? '#ffcc00' : '#cc66ff',
        });
        uiElements.push(priceLabel);

        const playerCurrency = shopItem.currency === 'AA' ? player.arcaneAsh : player.crystallineAnimus;
        const canAfford = playerCurrency >= shopItem.price;
        const buyBtn = this.add.text(width / 2 + 200, y, '[Buy]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: canAfford ? '#88ff88' : '#666666',
        }).setInteractive({ useHandCursor: canAfford })
          .on('pointerdown', () => {
            if (canAfford) {
              this.purchaseItem(shopItem.itemId, shopItem.price, shopItem.currency);
              renderShop();
            }
          });
        uiElements.push(buyBtn);
      });

      const closeBtn = this.createButton(width / 2, height / 2 + 240, 'Close', () => {
        destroyAll();
        this.updatePlayerDisplay();
      });
      uiElements.push(closeBtn);
    };

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'shop';

    renderShop();
  }

  private purchaseItem(itemId: string, price: number, currency: 'AA' | 'CA'): void {
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

    if (currency === 'AA') {
      player.arcaneAsh -= price;
    } else {
      player.crystallineAnimus -= price;
    }
    
    const existing = player.inventory.find(item => item.itemId === itemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      player.inventory.push({ itemId, quantity: 1 });
    }

    this.gameState.updatePlayer(player);
    
    const item = ItemDatabase.getItem(itemId);
    this.showMessage(`Purchased ${item?.name || 'item'} for ${price} ${currency}!`);
    this.updatePlayerDisplay();
  }

  private openForge(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    let selectedItem: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null } | null = null;
    let mode: 'enhance' | 'repair' = 'enhance';

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 750, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 250, 'Blacksmith\'s Forge', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(title);

    const balanceDisplay = CurrencyDisplay.createInlineCurrency(
      this,
      width / 2,
      height / 2 - 210,
      player.arcaneAsh,
      player.crystallineAnimus,
      'small'
    );
    balanceDisplay.setScrollFactor(0);
    balanceDisplay.x -= balanceDisplay.getBounds().width / 2;
    uiElements.push(balanceDisplay);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'forge';

    const renderForge = () => {
      uiElements.slice(4).forEach(el => el.destroy());
      uiElements.splice(4);

      // Tab buttons
      const enhanceTab = this.add.text(width / 2 - 120, height / 2 - 175, '[Enhance]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: mode === 'enhance' ? '#f0a020' : '#888888',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          mode = 'enhance';
          selectedItem = null;
          renderForge();
        });
      uiElements.push(enhanceTab);

      const repairTab = this.add.text(width / 2 + 120, height / 2 - 175, '[Repair]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: mode === 'repair' ? '#f0a020' : '#888888',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          mode = 'repair';
          selectedItem = null;
          renderForge();
        });
      uiElements.push(repairTab);

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

  private renderEnhanceMode(uiElements: Phaser.GameObjects.GameObject[], selectedItem: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null } | null, onSelect: (item: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null } | null) => void): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    
    const forgeableItems: Array<{ item: InventoryItem; equippedSlot: keyof PlayerEquipment | null }> = [];
    
    player.inventory.filter(item => ForgingSystem.canForgeItem(item)).forEach(item => {
      forgeableItems.push({ item, equippedSlot: null });
    });
    
    Object.entries(player.equipment).forEach(([slot, equipped]) => {
      if (equipped && ForgingSystem.canForgeItem(equipped)) {
        forgeableItems.push({ item: equipped, equippedSlot: slot as keyof PlayerEquipment });
      }
    });

    if (forgeableItems.length === 0) {
      const noItemsText = this.add.text(width / 2, height / 2, 'No forgeable items in inventory or equipped.\n(Weapons and armor can be enhanced)', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#cccccc',
        align: 'center',
      }).setOrigin(0.5);
      uiElements.push(noItemsText);
      return;
    }

    const itemsStartY = height / 2 - 140;
    const itemHeight = 35;
    const maxDisplay = 7;

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
      
      const itemText = this.add.text(width / 2 - 330, y, itemNameText, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
      });
      uiElements.push(itemText);

      const levelText = this.add.text(width / 2 + 80, y, currentLevel === maxLevel ? 'MAX' : `+${currentLevel}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: currentLevel === maxLevel ? '#ff8800' : '#88ff88',
      });
      uiElements.push(levelText);

      if (currentLevel < maxLevel) {
        const selectBtn = this.add.text(width / 2 + 150, y, '[Select]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: selectedItem === itemData ? '#ff8800' : '#8888ff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => onSelect(itemData));
        uiElements.push(selectBtn);
      }
    });

    if (selectedItem) {
      const detailY = height / 2 + 80;
      const currentLevel = selectedItem.item.enhancementLevel || 0;
      const targetLevel = currentLevel + 1;
      const cost = ForgingSystem.getForgingCost(targetLevel);

      if (cost) {
        const detailPanel = this.add.rectangle(width / 2, detailY, 700, 100, 0x1a1a2e).setOrigin(0.5);
        uiElements.push(detailPanel);

        const detailTitle = this.add.text(width / 2, detailY - 40, `Enhance to +${targetLevel}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.medium,
          color: '#f0a020',
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

        const detailsText = this.add.text(width / 2, detailY - 10, 
          `Success: ${tierData.success}  |  Fail: ${tierData.fail}  |  Destroy: ${tierData.destroy}\nCost: ${cost.aa} AA + ${cost.ca} CA`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#ffffff',
          align: 'center',
        }).setOrigin(0.5);
        uiElements.push(detailsText);

        const forgeBtn = this.createButton(width / 2, detailY + 35, 'Forge Item', () => {
          this.attemptForging(selectedItem!);
          onSelect(null);
        });
        uiElements.push(forgeBtn);
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
        fontSize: FONTS.size.small,
        color: '#cccccc',
        align: 'center',
      }).setOrigin(0.5);
      uiElements.push(noItemsText);
      return;
    }

    const itemsStartY = height / 2 - 140;
    const itemHeight = 35;
    const maxDisplay = 7;

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
      
      const itemText = this.add.text(width / 2 - 330, y, itemNameText, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
      });
      uiElements.push(itemText);

      const durabilityText = this.add.text(width / 2 + 80, y, `${Math.floor(currentDurability)}/${maxDurability}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: durabilityColor,
      });
      uiElements.push(durabilityText);

      const selectBtn = this.add.text(width / 2 + 200, y, '[Select]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: selectedItem === itemData ? '#ff8800' : '#8888ff',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onSelect(itemData));
      uiElements.push(selectBtn);
    });

    // Repair All button
    if (repairableItems.length > 0) {
      const repairAllBtn = this.add.text(width / 2, height / 2 - 175, '[Repair All]', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#88ff88',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.showRepairAllConfirmation(repairableItems);
        });
      uiElements.push(repairAllBtn);
    }

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
          `Durability: ${Math.floor(selectedItem.item.durability ?? 100)}/${selectedItem.item.maxDurability ?? 100} → ${selectedItem.item.maxDurability ?? 100}/${selectedItem.item.maxDurability ?? 100}\nPay ${cost.aa} AA  OR  ${cost.ca.toFixed(2)} CA`, {
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

        const repairCABtn = this.createButton(width / 2 + 180, detailY + 40, `Pay ${cost.ca.toFixed(2)} CA`, () => {
          this.attemptRepair(selectedItem!, 'CA');
          onSelect(null);
        });
        uiElements.push(repairCABtn);
      }
    }
  }

  private attemptRepair(itemData: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null }, currency: 'AA' | 'CA'): void {
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
      player.arcaneAsh -= cost.aa;
    } else {
      if (player.crystallineAnimus < cost.ca) {
        this.showMessage(`Insufficient funds! Need ${cost.ca.toFixed(2)} CA`);
        return;
      }
      player.crystallineAnimus -= cost.ca;
    }
    
    ForgingSystem.repairItem(itemData.item);
    
    if (itemData.equippedSlot) {
      player.equipment[itemData.equippedSlot] = itemData.item;
    }
    
    this.gameState.updatePlayer(player);
    
    const costText = currency === 'AA' ? `${cost.aa} AA` : `${cost.ca.toFixed(2)} CA`;
    this.showMessage(`Item repaired for ${costText}!`);
    this.updatePlayerDisplay();
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

  private executeRepairAll(repairableItems: Array<{ item: InventoryItem; equippedSlot: keyof PlayerEquipment | null }>, currency: 'AA' | 'CA'): void {
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
      player.arcaneAsh -= totalAA;
    } else {
      if (player.crystallineAnimus < totalCA) {
        this.showMessage(`Insufficient funds! Need ${totalCA.toFixed(2)} CA`);
        return;
      }
      player.crystallineAnimus -= totalCA;
    }

    let repairedCount = 0;
    for (const itemData of repairableItems) {
      ForgingSystem.repairItem(itemData.item);
      if (itemData.equippedSlot) {
        player.equipment[itemData.equippedSlot] = itemData.item;
      }
      repairedCount++;
    }

    this.gameState.updatePlayer(player);
    
    const costText = currency === 'AA' ? `${totalAA} AA` : `${totalCA.toFixed(2)} CA`;
    this.showMessage(`Repaired ${repairedCount} items for ${costText}!`);
    this.updatePlayerDisplay();
    
    this.openForge();
  }

  private attemptForging(itemData: { item: InventoryItem; equippedSlot: keyof PlayerEquipment | null }): void {
    const player = this.gameState.getPlayer();
    const targetLevel = (itemData.item.enhancementLevel || 0) + 1;
    const cost = ForgingSystem.getForgingCost(targetLevel);
    
    if (!cost) {
      this.showMessage('Invalid forging level!');
      return;
    }
    
    if (player.arcaneAsh < cost.aa || player.crystallineAnimus < cost.ca) {
      this.showMessage(`Insufficient funds! Need ${cost.aa} AA and ${cost.ca.toFixed(1)} CA`);
      return;
    }
    
    const result = ForgingSystem.attemptForging(itemData.item, player.arcaneAsh, player.crystallineAnimus);

    player.arcaneAsh -= cost.aa;
    player.crystallineAnimus -= cost.ca;

    if (!result.success && result.destroyed) {
      if (itemData.equippedSlot) {
        player.equipment[itemData.equippedSlot] = undefined;
      } else {
        this.gameState.removeItemFromInventory(itemData.item.itemId, 1);
      }
      this.gameState.updatePlayer(player);
      this.showMessage(result.message);
      this.updatePlayerDisplay();
      return;
    }

    itemData.item.enhancementLevel = result.newLevel;
    
    if (itemData.equippedSlot) {
      player.equipment[itemData.equippedSlot] = itemData.item;
    }
    
    this.gameState.updatePlayer(player);
    this.showMessage(result.message);
    this.updatePlayerDisplay();
  }

  private openInn(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const REST_COST = 0; // Free for testing

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    const panel = this.add.rectangle(width / 2, height / 2, 600, 400, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 160, 'The Weary Traveler Inn', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#6699ff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    uiElements.push(title);

    const innkeeperText = this.add.text(width / 2, height / 2 - 100, '"Welcome, traveler. Rest your weary bones."', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
      fontStyle: 'italic',
    }).setOrigin(0.5);
    uiElements.push(innkeeperText);

    const playerStatusText = this.add.text(width / 2, height / 2 - 50, 
      `Current Health: ${player.health} / ${player.maxHealth}\n` +
      `Current Stamina: ${player.stamina} / ${player.maxStamina}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);
    uiElements.push(playerStatusText);

    const costText = this.add.text(width / 2, height / 2 + 20, 
      `Rest Cost: FREE (Testing Mode)`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#88ff88',
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
      const restBtn = this.createButton(width / 2, height / 2 + 100, 'Already Fully Rested', () => {});
      const btnBg = restBtn.getAt(0) as Phaser.GameObjects.Rectangle;
      btnBg.setFillStyle(0x666666);
      btnBg.disableInteractive();
      uiElements.push(restBtn);
    } else {
      const restBtn = this.createButton(width / 2, height / 2 + 100, 'Rest and Restore (FREE)', () => {
        player.health = player.maxHealth;
        player.stamina = player.maxStamina;
        this.gameState.updatePlayer(player);
        this.showMessage('You feel refreshed and restored!');
        this.updatePlayerDisplay();
        destroyAll();
      });
      uiElements.push(restBtn);
    }

    const closeBtn = this.createButton(width / 2, height / 2 + 160, 'Leave', () => {
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
    const panel = this.add.rectangle(width / 2, height / 2, 700, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 240, 'Garthek the Stitcher', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#9944cc',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    uiElements.push(title);

    const subtitle = this.add.text(width / 2, height / 2 - 200, 
      '"I can bind your equipment to your very soul.\nSoulbound items will return to you upon death."', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
      fontStyle: 'italic',
      align: 'center',
    }).setOrigin(0.5);
    uiElements.push(subtitle);

    const infoText = this.add.text(width / 2, height / 2 - 140, 
      'Select equipment slots to bind (max 3 slots):', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5);
    uiElements.push(infoText);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'soulbinding' as any;

    // Define equipment slots
    const slots = [
      { key: 'mainHand' as keyof PlayerEquipment, label: 'Main Hand' },
      { key: 'offHand' as keyof PlayerEquipment, label: 'Off Hand' },
      { key: 'head' as keyof PlayerEquipment, label: 'Head' },
      { key: 'chest' as keyof PlayerEquipment, label: 'Chest' },
      { key: 'legs' as keyof PlayerEquipment, label: 'Legs' },
      { key: 'feet' as keyof PlayerEquipment, label: 'Feet' },
      { key: 'hands' as keyof PlayerEquipment, label: 'Hands' },
      { key: 'accessory' as keyof PlayerEquipment, label: 'Accessory' },
    ];

    let startY = height / 2 - 100;
    const slotCheckboxes: Map<string, Phaser.GameObjects.Container> = new Map();

    slots.forEach((slot, index) => {
      const slotKey = slot.key as keyof PlayerEquipment;
      const x = width / 2 - 200;
      const y = startY + (index % 4) * 40;
      const col = Math.floor(index / 4);
      const posX = x + col * 350;

      const item = player.equipment[slotKey];
      const isEquipped = !!item;
      const isBound = selectedSlots.has(slotKey);

      // Checkbox
      const checkbox = this.add.rectangle(posX, y, 20, 20, isBound ? 0x44ff44 : 0x444444)
        .setStrokeStyle(2, 0xffffff);

      let displayName = '[Empty]';
      if (isEquipped && item) {
        const itemData = ItemDatabase.getItem(item.itemId);
        displayName = itemData ? itemData.name : item.itemId;
      }

      const slotText = this.add.text(posX + 15, y, 
        `${slot.label}: ${displayName}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: isEquipped ? '#ffffff' : '#666666',
      }).setOrigin(0, 0.5);

      const container = this.add.container(0, 0, [checkbox, slotText]);
      
      if (isEquipped) {
        container.setInteractive(
          new Phaser.Geom.Rectangle(posX - 10, y - 10, 280, 30),
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
      const success = await ApiClient.setSoulboundSlots(Array.from(selectedSlots));
      if (success) {
        this.showMessage('Soul bindings saved successfully');
        destroyAll();
      } else {
        this.showMessage('Failed to save bindings');
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
      fontSize: FONTS.size.xlarge,
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1002);
    uiElements.push(title);

    // Divider
    const divider = this.add.line(width / 2, height / 2, 0, -200, 0, 200, 0x444444, 1)
      .setOrigin(0.5).setDepth(1002);
    uiElements.push(divider);

    // Left Panel - Returned Items
    const leftTitle = this.add.text(width / 2 - 300, height / 2 - 200, 'Returned Items', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#44ff44',
    }).setOrigin(0.5).setDepth(1002);
    uiElements.push(leftTitle);

    // Fetch returned items
    const returnedItems = await ApiClient.getPendingReturns();
    
    if (returnedItems.length === 0) {
      const noItems = this.add.text(width / 2 - 300, height / 2, 'No items to claim', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
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
    const rightTitle = this.add.text(width / 2 + 300, height / 2 - 200, 'Karma Leaderboard', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
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
}
