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

export class TownScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private infoText!: Phaser.GameObjects.Text;
  private menuState: 'none' | 'inventory' | 'equipment' | 'shop' | 'forge' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('TownScene');
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
      fontSize: '32px',
      color: '#f0a020',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 120, 'ROBOKA - City of Steel', {
      fontSize: '18px',
      color: '#cccccc',
    }).setOrigin(0.5);
    
    this.infoText = this.add.text(20, 20, this.getPlayerInfo(), {
      fontSize: '11px',
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
    if (this.menuState === 'inventory' || this.menuState === 'equipment' || this.menuState === 'shop') {
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
        fontSize: '12px',
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

    const msg = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      `${name}\n\n${description}\n\n[Coming Soon]`,
      {
        fontSize: '16px',
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
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    return container;
  }

  private showMessage(message: string): void {
    const msg = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, message, {
      fontSize: '18px',
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

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 700, 500, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 220, `Inventory (${player.inventory.reduce((sum, item) => sum + item.quantity, 0)}/${player.inventorySlots})`, {
      fontSize: '24px',
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
      
      const itemLabel = this.add.text(width / 2 - 320, y, `${item.name} x${invItem.quantity}`, {
        fontSize: '14px',
        color: '#ffffff',
      });
      uiElements.push(itemLabel);

      const weapon = ItemDatabase.getWeapon(invItem.itemId);
      const armor = ItemDatabase.getArmor(invItem.itemId);
      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (weapon) {
        if (weapon.twoHanded) {
          const equipBtn = this.add.text(width / 2 + 100, y, '[Equip]', {
            fontSize: '13px',
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
            fontSize: '12px',
            color: '#88ff88',
          }).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              this.equipItemFromInventory(invItem.itemId, 'mainHand');
              destroyAll();
              this.openInventory();
            });
          uiElements.push(equipMHBtn);

          const equipOHBtn = this.add.text(width / 2 + 150, y, '[Equip OH]', {
            fontSize: '12px',
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
          fontSize: '13px',
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
          fontSize: '13px',
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
        fontSize: '13px',
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

  private openEquipment(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 700, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 250, 'Equipment', {
      fontSize: '24px',
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(title);

    const destroyAll = () => {
      uiElements.forEach(el => el.destroy());
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
      });
      uiElements.push(slotLabel);

      const equipped = player.equipment[slot.key];
      const item = equipped ? ItemDatabase.getItem(equipped.itemId) : null;
      const itemName = equipped ? ForgingSystem.getItemDisplayName({ itemId: equipped.itemId, quantity: 1, enhancementLevel: equipped.enhancementLevel }) : 'Empty';

      const itemLabel = this.add.text(width / 2 - 200, y, itemName, {
        fontSize: '14px',
        color: item ? '#ffffff' : '#666666',
      });
      uiElements.push(itemLabel);

      if (equipped) {
        const unequipBtn = this.add.text(width / 2 + 180, y, '[Unequip]', {
          fontSize: '13px',
          color: '#ff8888',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            const result = EquipmentManager.unequipItem(player, slot.key);
            this.showMessage(result.message);
            if (result.success) {
              this.gameState.updatePlayer(player);
            }
            destroyAll();
            this.openEquipment();
          });
        uiElements.push(unequipBtn);
      }
    });

    const statsY = height / 2 + 100;
    const statsTitle = this.add.text(width / 2 - 320, statsY, 'Combat Stats:', {
      fontSize: '16px',
      color: '#f0a020',
    });
    uiElements.push(statsTitle);

    const statsText = [
      `Evasion: ${player.stats.calculatedEvasion}`,
      `Damage Reduction: ${Math.floor(player.stats.damageReduction * 100)}%`,
      `Attack Bonus: +${player.stats.attackBonus}`,
      `Damage Bonus: +${player.stats.damageBonus}`,
    ].join('\n');

    const statsDisplay = this.add.text(width / 2 - 320, statsY + 25, statsText, {
      fontSize: '14px',
      color: '#ffffff',
      lineSpacing: 5,
    });
    uiElements.push(statsDisplay);

    const closeBtn = this.createButton(width / 2, height / 2 + 240, 'Close', () => {
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

      const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setInteractive();
      const panel = this.add.rectangle(width / 2, height / 2, 750, 550, 0x2a2a3e).setOrigin(0.5);
      uiElements.push(overlay, panel);

      const title = this.add.text(width / 2, height / 2 - 250, 'Merchant\'s Shop', {
        fontSize: '24px',
        color: '#f0a020',
      }).setOrigin(0.5);
      uiElements.push(title);

      const currencyText = this.add.text(width / 2, height / 2 - 210, `Arcane Ash: ${player.arcaneAsh} AA  |  Crystalline Animus: ${player.crystallineAnimus.toFixed(1)} CA`, {
        fontSize: '14px',
        color: '#66cc66',
      }).setOrigin(0.5);
      uiElements.push(currencyText);

      const tabY = height / 2 - 170;
      const tabSpacing = 120;

      const weaponsTab = this.add.text(width / 2 - tabSpacing, tabY, 'Weapons', {
        fontSize: '14px',
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
        fontSize: '14px',
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
        fontSize: '14px',
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

        const itemLabel = this.add.text(width / 2 - 340, y, item.name, {
          fontSize: '13px',
          color: '#ffffff',
        });
        uiElements.push(itemLabel);

        const currencyLabel = shopItem.currency === 'AA' ? 'AA' : 'CA';
        const priceLabel = this.add.text(width / 2 + 80, y, `${shopItem.price} ${currencyLabel}`, {
          fontSize: '13px',
          color: shopItem.currency === 'AA' ? '#ffcc00' : '#cc66ff',
        });
        uiElements.push(priceLabel);

        const playerCurrency = shopItem.currency === 'AA' ? player.arcaneAsh : player.crystallineAnimus;
        const canAfford = playerCurrency >= shopItem.price;
        const buyBtn = this.add.text(width / 2 + 200, y, '[Buy]', {
          fontSize: '13px',
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

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 750, 550, 0x2a2a3e).setOrigin(0.5);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 250, 'Blacksmith\'s Forge', {
      fontSize: '24px',
      color: '#f0a020',
    }).setOrigin(0.5);
    uiElements.push(title);

    const balanceText = this.add.text(width / 2, height / 2 - 210, `${player.arcaneAsh} AA | ${player.crystallineAnimus.toFixed(1)} CA`, {
      fontSize: '14px',
      color: '#88ff88',
    }).setOrigin(0.5);
    uiElements.push(balanceText);

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

      const forgeableItems = player.inventory.filter(item => ForgingSystem.canForgeItem(item));

      if (forgeableItems.length === 0) {
        const noItemsText = this.add.text(width / 2, height / 2, 'No forgeable items in inventory.\n(Weapons and armor can be enhanced)', {
          fontSize: '16px',
          color: '#cccccc',
          align: 'center',
        }).setOrigin(0.5);
        uiElements.push(noItemsText);
      } else {
        const itemsStartY = height / 2 - 160;
        const itemHeight = 35;
        const maxDisplay = 8;

        forgeableItems.slice(0, maxDisplay).forEach((invItem, index) => {
          const y = itemsStartY + index * itemHeight;
          const displayName = ForgingSystem.getItemDisplayName(invItem);
          const currentLevel = invItem.enhancementLevel || 0;
          const maxLevel = ForgingSystem.getMaxEnhancementLevel();
          
          const itemText = this.add.text(width / 2 - 330, y, displayName, {
            fontSize: '14px',
            color: '#ffffff',
          });
          uiElements.push(itemText);

          const levelText = this.add.text(width / 2 + 80, y, currentLevel === maxLevel ? 'MAX' : `+${currentLevel}`, {
            fontSize: '14px',
            color: currentLevel === maxLevel ? '#ff8800' : '#88ff88',
          });
          uiElements.push(levelText);

          if (currentLevel < maxLevel) {
            const selectBtn = this.add.text(width / 2 + 150, y, '[Select]', {
              fontSize: '13px',
              color: selectedItem === invItem ? '#ff8800' : '#8888ff',
            }).setInteractive({ useHandCursor: true })
              .on('pointerdown', () => {
                selectedItem = invItem;
                renderForge();
              });
            uiElements.push(selectBtn);
          }
        });

        if (selectedItem) {
          const detailY = height / 2 + 50;
          const currentLevel = selectedItem.enhancementLevel || 0;
          const targetLevel = currentLevel + 1;
          const cost = ForgingSystem.getForgingCost(targetLevel);

          if (cost) {
            const detailPanel = this.add.rectangle(width / 2, detailY + 30, 700, 140, 0x1a1a2e).setOrigin(0.5);
            uiElements.push(detailPanel);

            const detailTitle = this.add.text(width / 2, detailY - 20, `Enhance to +${targetLevel}`, {
              fontSize: '18px',
              color: '#f0a020',
            }).setOrigin(0.5);
            uiElements.push(detailTitle);

            const tierData = [
              { tier: 1, success: '95%', fail: 'No change', destroy: 'None' },
              { tier: 2, success: '85%', fail: 'No change', destroy: 'None' },
              { tier: 3, success: '70%', fail: 'Downgrade', destroy: 'None' },
              { tier: 4, success: '60%', fail: 'Downgrade', destroy: 'None' },
              { tier: 5, success: '45%', fail: 'Downgrade', destroy: '10%' },
              { tier: 6, success: '35%', fail: 'Downgrade', destroy: '15%' },
              { tier: 7, success: '25%', fail: 'Downgrade', destroy: '25%' },
              { tier: 8, success: '15%', fail: 'Downgrade', destroy: '35%' },
              { tier: 9, success: '10%', fail: 'Downgrade', destroy: '50%' },
            ][targetLevel - 1];

            const detailsText = this.add.text(width / 2 - 320, detailY + 10, 
              `Success: ${tierData.success}  |  Failure: ${tierData.fail}  |  Destroy: ${tierData.destroy}\nCost: ${cost.aa} AA + ${cost.ca} CA`, {
              fontSize: '13px',
              color: '#ffffff',
            });
            uiElements.push(detailsText);

            const weapon = ItemDatabase.getWeapon(selectedItem.itemId);
            if (weapon) {
              const baseDmg = `${weapon.damage.numDice}d${weapon.damage.dieSize}+${weapon.damage.modifier}`;
              const enhanced = ForgingSystem.calculateEnhancedDamage(weapon, targetLevel);
              const newDmg = `${enhanced.numDice}d${enhanced.dieSize}+${enhanced.modifier}`;
              const dmgText = this.add.text(width / 2 - 320, detailY + 50, `Damage: ${baseDmg} → ${newDmg}`, {
                fontSize: '13px',
                color: '#88ff88',
              });
              uiElements.push(dmgText);
            }

            const forgeBtn = this.createButton(width / 2, detailY + 90, 'Forge Item', () => {
              this.attemptForging(selectedItem!);
              selectedItem = null;
              renderForge();
            });
            uiElements.push(forgeBtn);
          }
        }
      }

      const closeBtn = this.createButton(width / 2, height / 2 + 230, 'Close', () => {
        destroyAll();
      });
      uiElements.push(closeBtn);
    };

    renderForge();
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
}
