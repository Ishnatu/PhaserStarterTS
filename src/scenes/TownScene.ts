import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { ItemDatabase } from '../config/ItemDatabase';
import { EquipmentManager } from '../systems/EquipmentManager';
import { DiceRoller } from '../utils/DiceRoller';
import { PlayerEquipment, InventoryItem } from '../types/GameTypes';
import { ShopData } from '../config/ShopData';
import { BuffManager } from '../systems/BuffManager';
import { ForgingSystem } from '../systems/ForgingSystem';
import { CurrencyDisplay } from '../utils/CurrencyDisplay';
import { FONTS } from '../config/fonts';
import { ItemColorUtil } from '../utils/ItemColorUtil';
import { ItemSprites } from '../config/ItemSprites';

export class TownScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private infoText!: Phaser.GameObjects.Text;
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
    this.gameState.updatePlayer(player);

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x2a2a3e).setOrigin(0);

    this.add.text(width / 2, 60, 'Gemforge Chronicles', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: '#f0a020',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 120, 'ROBOKA - City of Steel', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#cccccc',
    }).setOrigin(0.5);
    
    this.infoText = this.add.text(20, 20, this.getPlayerInfo(), {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      lineSpacing: 4,
    });

    this.createNPCs();

    const exploreBtn = this.createButton(width / 2, height - 100, 'Venture Into the Wilds', () => {
      SceneManager.getInstance().transitionTo('explore');
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
  }

  private handleEscapeKey(): void {
    if (this.menuState === 'inventory' || this.menuState === 'equipment' || this.menuState === 'shop' || this.menuState === 'footlocker') {
      if (this.currentMenuCloseFunction) {
        this.currentMenuCloseFunction();
      }
    }
  }

  private createNPCs(): void {
    const { width } = this.cameras.main;
    const npcY = 240;
    const npcSpacing = 90;

    const npcs = [
      { name: 'Blacksmith', color: 0xff6633, description: 'Forges and upgrades equipment' },
      { name: 'Merchant', color: 0x66cc66, description: 'Buys and sells goods' },
      { name: 'Innkeeper', color: 0x6699ff, description: 'Provides rest and healing' },
      { name: 'Vault Keeper', color: 0x88ddff, description: 'Manages your storage footlocker' },
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
      const y = npcY + row * 100;

      const npcBox = this.add.rectangle(x, y, 80, 80, npc.color)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => npcBox.setFillStyle(npc.color, 0.7))
        .on('pointerout', () => npcBox.setFillStyle(npc.color, 1))
        .on('pointerdown', () => this.interactWithNPC(npc.name, npc.description));

      this.add.text(x, y + 50, npc.name, {
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

  private getPlayerInfo(): string {
    const player = this.gameState.getPlayer();
    return [
      `Health: ${player.health} / ${player.maxHealth}`,
      `Stamina: ${player.stamina} / ${player.maxStamina}`,
      `Level: ${player.level}`,
      ``,
      `Evasion: ${player.stats.calculatedEvasion}`,
      `Damage Reduction: ${Math.floor(player.stats.damageReduction * 100)}%`,
      ``,
      `Arcane Ash (AA): ${player.arcaneAsh}`,
      `Crystalline Animus (CA): ${player.crystallineAnimus.toFixed(1)}`,
    ].join('\n');
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
      this.infoText.setText(this.getPlayerInfo());
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
    this.infoText.setText(this.getPlayerInfo());
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

    const updateInfoDisplay = () => {
      infoElements.forEach(el => el.destroy());
      infoElements = [];

      if (selectedSlot) {
        const equipped = player.equipment[selectedSlot.key];
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

          const infoBg = this.add.rectangle(width / 2, infoAreaY + 20, 350, 65, 0x1a1a2e, 0.95).setOrigin(0.5);
          infoElements.push(infoBg);

          const nameLabel = this.add.text(width / 2, infoAreaY, itemName, {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.small,
            color: itemColor,
          }).setOrigin(0.5);
          infoElements.push(nameLabel);

          const durabilityLabel = this.add.text(width / 2, infoAreaY + 20, `Durability: ${Math.floor(currentDurability)}/${maxDurability}`, {
            fontFamily: FONTS.primary,
            fontSize: '11px',
            color: durabilityColor,
          }).setOrigin(0.5);
          infoElements.push(durabilityLabel);

          const unequipBtn = this.add.text(width / 2, infoAreaY + 40, '[Unequip]', {
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

          infoElements.forEach(el => uiElements.push(el));
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
      this.infoText.setText(this.getPlayerInfo());
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
        this.infoText.setText(this.getPlayerInfo());
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
    this.infoText.setText(this.getPlayerInfo());
  }

  private openForge(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    let selectedItem: InventoryItem | null = null;
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

  private renderEnhanceMode(uiElements: Phaser.GameObjects.GameObject[], selectedItem: InventoryItem | null, onSelect: (item: InventoryItem | null) => void): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const forgeableItems = player.inventory.filter(item => ForgingSystem.canForgeItem(item));

    if (forgeableItems.length === 0) {
      const noItemsText = this.add.text(width / 2, height / 2, 'No forgeable items in inventory.\n(Weapons and armor can be enhanced)', {
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

    forgeableItems.slice(0, maxDisplay).forEach((invItem, index) => {
      const y = itemsStartY + index * itemHeight;
      const displayName = ForgingSystem.getItemDisplayName(invItem);
      const currentLevel = invItem.enhancementLevel || 0;
      const maxLevel = ForgingSystem.getMaxEnhancementLevel();
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemText = this.add.text(width / 2 - 330, y, displayName, {
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
          color: selectedItem === invItem ? '#ff8800' : '#8888ff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => onSelect(invItem));
        uiElements.push(selectBtn);
      }
    });

    if (selectedItem) {
      const detailY = height / 2 + 80;
      const currentLevel = selectedItem.enhancementLevel || 0;
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

  private renderRepairMode(uiElements: Phaser.GameObjects.GameObject[], selectedItem: InventoryItem | null, onSelect: (item: InventoryItem | null) => void): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    
    // Get all items that need repair (durability < max) or can be repaired
    const repairableItems = player.inventory.filter(item => {
      const currentDurability = item.durability ?? 100;
      const maxDurability = item.maxDurability ?? 100;
      return (ItemDatabase.getWeapon(item.itemId) || ItemDatabase.getArmor(item.itemId)) && currentDurability < maxDurability;
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

    repairableItems.slice(0, maxDisplay).forEach((invItem, index) => {
      const y = itemsStartY + index * itemHeight;
      const displayName = ForgingSystem.getItemDisplayName(invItem);
      const currentDurability = invItem.durability ?? 100;
      const maxDurability = invItem.maxDurability ?? 100;
      const durabilityPercent = (currentDurability / maxDurability) * 100;
      
      let durabilityColor = '#88ff88';
      if (durabilityPercent <= 0) durabilityColor = '#ff4444';
      else if (durabilityPercent <= 25) durabilityColor = '#ffaa00';
      else if (durabilityPercent <= 50) durabilityColor = '#ffff00';
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemText = this.add.text(width / 2 - 330, y, displayName, {
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
        color: selectedItem === invItem ? '#ff8800' : '#8888ff',
      }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onSelect(invItem));
      uiElements.push(selectBtn);
    });

    if (selectedItem) {
      const detailY = height / 2 + 80;
      const result = ForgingSystem.getRepairCost(selectedItem);

      if (result) {
        const detailPanel = this.add.rectangle(width / 2, detailY, 700, 100, 0x1a1a2e).setOrigin(0.5);
        uiElements.push(detailPanel);

        const detailTitle = this.add.text(width / 2, detailY - 40, `Repair ${ForgingSystem.getItemDisplayName(selectedItem)}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.medium,
          color: '#f0a020',
        }).setOrigin(0.5);
        uiElements.push(detailTitle);

        const detailsText = this.add.text(width / 2, detailY - 10, 
          `Durability: ${Math.floor(selectedItem.durability ?? 100)}/${selectedItem.maxDurability ?? 100} → ${selectedItem.maxDurability ?? 100}/${selectedItem.maxDurability ?? 100}\nCost: ${result.aa} AA + ${result.ca.toFixed(1)} CA`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#ffffff',
          align: 'center',
        }).setOrigin(0.5);
        uiElements.push(detailsText);

        const repairBtn = this.createButton(width / 2, detailY + 35, 'Repair Item', () => {
          this.attemptRepair(selectedItem!);
          onSelect(null);
        });
        uiElements.push(repairBtn);
      }
    }
  }

  private attemptRepair(item: InventoryItem): void {
    const player = this.gameState.getPlayer();
    const cost = ForgingSystem.getRepairCost(item);
    
    if (cost.aa === 0 && cost.ca === 0) {
      this.showMessage('Item is already at full durability!');
      return;
    }
    
    if (player.arcaneAsh < cost.aa || player.crystallineAnimus < cost.ca) {
      this.showMessage(`Insufficient funds! Need ${cost.aa} AA and ${cost.ca.toFixed(1)} CA`);
      return;
    }
    
    ForgingSystem.repairItem(item);
    player.arcaneAsh -= cost.aa;
    player.crystallineAnimus -= cost.ca;
    this.gameState.updatePlayer(player);
    
    this.showMessage(`Item repaired for ${cost.aa} AA and ${cost.ca.toFixed(1)} CA!`);
    this.infoText.setText(this.getPlayerInfo());
  }

  private attemptForging(item: InventoryItem): void {
    const player = this.gameState.getPlayer();
    const result = ForgingSystem.attemptForging(item, player.arcaneAsh, player.crystallineAnimus);

    if (!result.success && result.destroyed) {
      this.gameState.removeItemFromInventory(item.itemId, 1);
      this.showMessage(result.message);
      this.infoText.setText(this.getPlayerInfo());
      return;
    }

    if (!result.success && !result.downgraded) {
      this.showMessage(result.message);
      return;
    }

    const targetLevel = (item.enhancementLevel || 0) + 1;
    const cost = ForgingSystem.getForgingCost(targetLevel);
    
    if (cost) {
      player.arcaneAsh -= cost.aa;
      player.crystallineAnimus -= cost.ca;
    }

    item.enhancementLevel = result.newLevel;
    this.gameState.updatePlayer(player);
    this.showMessage(result.message);
    this.infoText.setText(this.getPlayerInfo());
  }

  private openInn(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];
    const REST_COST = 50;

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
      `Rest Cost: ${REST_COST} Arcane Ash`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc66',
    }).setOrigin(0.5);
    uiElements.push(costText);

    const balanceDisplay = CurrencyDisplay.createCurrencyText(
      this,
      width / 2,
      height / 2 + 50,
      player.arcaneAsh,
      'AA',
      'small'
    );
    balanceDisplay.setScrollFactor(0);
    balanceDisplay.x -= balanceDisplay.getBounds().width / 2;
    balanceDisplay.list.forEach(child => {
      if (child.type === 'Text') {
        const text = child as Phaser.GameObjects.Text;
        text.setColor(player.arcaneAsh >= REST_COST ? '#88ff88' : '#ff8888');
      }
    });
    uiElements.push(balanceDisplay);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'inn';

    const isFullyRested = player.health >= player.maxHealth && player.stamina >= player.maxStamina;
    const canAfford = player.arcaneAsh >= REST_COST;

    if (isFullyRested) {
      const restBtn = this.createButton(width / 2, height / 2 + 100, 'Already Fully Rested', () => {});
      const btnBg = restBtn.getAt(0) as Phaser.GameObjects.Rectangle;
      btnBg.setFillStyle(0x666666);
      btnBg.disableInteractive();
      uiElements.push(restBtn);
    } else if (!canAfford) {
      const restBtn = this.createButton(width / 2, height / 2 + 100, 'Not Enough Arcane Ash', () => {});
      const btnBg = restBtn.getAt(0) as Phaser.GameObjects.Rectangle;
      btnBg.setFillStyle(0x883333);
      btnBg.disableInteractive();
      uiElements.push(restBtn);
    } else {
      const restBtn = this.createButton(width / 2, height / 2 + 100, 'Rest and Restore', () => {
        player.arcaneAsh -= REST_COST;
        player.health = player.maxHealth;
        player.stamina = player.maxStamina;
        this.gameState.updatePlayer(player);
        this.showMessage('You feel refreshed and restored!');
        this.infoText.setText(this.getPlayerInfo());
        destroyAll();
      });
      uiElements.push(restBtn);
    }

    const closeBtn = this.createButton(width / 2, height / 2 + 160, 'Leave', () => {
      destroyAll();
    });
    uiElements.push(closeBtn);
  }
}
