import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { ItemDatabase } from '../config/ItemDatabase';
import { DiceRoller } from '../utils/DiceRoller';
import { Delve, DelveRoom } from '../types/GameTypes';

export class DelveScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private currentDelve!: Delve;
  private roomDisplay!: Phaser.GameObjects.Container;
  private isOverlayActive: boolean = false;
  private menuState: 'none' | 'main' | 'inventory' | 'quit' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('DelveScene');
  }

  init(data: { delve: Delve }) {
    this.currentDelve = data.delve;
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('delve');

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    this.add.text(width / 2, 30, `Delve - Tier ${this.currentDelve.tier}`, {
      fontSize: '24px',
      color: '#ff8844',
    }).setOrigin(0.5);

    this.renderDelveMap();
    this.renderCurrentRoom();

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    
    this.escKey.on('down', () => {
      this.handleEscapeKey();
    });

    const menuBtn = this.createButton(width - 100, 20, 'Menu', () => {
      this.openMenu();
    });
  }

  private handleEscapeKey(): void {
    if (this.menuState === 'inventory') {
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

  private renderDelveMap(): void {
    const { width } = this.cameras.main;
    const mapY = 80;
    const roomSpacing = 80;
    const startX = width / 2 - ((this.currentDelve.rooms.size - 1) * roomSpacing) / 2;

    let index = 0;
    this.currentDelve.rooms.forEach((room, roomId) => {
      const x = startX + index * roomSpacing;
      const y = mapY;

      const isCurrent = roomId === this.currentDelve.currentRoomId;
      const color = this.getRoomColor(room, isCurrent);

      const roomIcon = this.add.circle(x, y, 20, color);
      
      if (isCurrent) {
        const glow = this.add.circle(x, y, 28, color, 0.3);
        this.tweens.add({
          targets: glow,
          scale: 1.2,
          alpha: 0.1,
          duration: 800,
          yoyo: true,
          repeat: -1,
        });
      }

      const label = this.add.text(x, y + 35, this.getRoomLabel(room), {
        fontSize: '10px',
        color: '#cccccc',
      }).setOrigin(0.5);

      if (index < this.currentDelve.rooms.size - 1) {
        this.add.line(0, 0, x + 20, y, x + roomSpacing - 20, y, 0x666666).setOrigin(0);
      }

      index++;
    });
  }

  private renderCurrentRoom(): void {
    const { width, height } = this.cameras.main;
    const currentRoom = this.currentDelve.rooms.get(this.currentDelve.currentRoomId);

    if (!currentRoom) return;

    // Check if all rooms are completed
    const allRoomsCompleted = Array.from(this.currentDelve.rooms.values()).every(room => room.completed);

    if (allRoomsCompleted) {
      this.showDelveCompletion();
      return;
    }

    const roomY = 200;

    this.add.rectangle(width / 2, roomY + 100, 600, 200, 0x2a2a4e, 0.5).setOrigin(0.5);

    this.add.text(width / 2, roomY, this.getRoomDescription(currentRoom), {
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 500 },
    }).setOrigin(0.5);

    const btnY = roomY + 180;

    if (!currentRoom.completed) {
      if (currentRoom.type === 'combat' || currentRoom.type === 'boss') {
        this.createButton(width / 2, btnY, 'Enter Combat', () => {
          this.startCombat(currentRoom);
        });
      } else if (currentRoom.type === 'treasure') {
        this.createButton(width / 2, btnY, 'Collect Treasure', () => {
          this.collectTreasure(currentRoom);
        });
      } else {
        this.createButton(width / 2, btnY, 'Solve Challenge', () => {
          this.solveChallenge(currentRoom);
        });
      }
    } else {
      this.add.text(width / 2, btnY, '✓ Room Cleared', {
        fontSize: '16px',
        color: '#00ff00',
      }).setOrigin(0.5);
    }

    if (currentRoom.connections.length > 0 && currentRoom.completed) {
      this.createButton(width / 2, btnY + 60, 'Proceed to Next Room', () => {
        this.moveToNextRoom(currentRoom);
      });
    }
  }

  private showDelveCompletion(): void {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, 700, 300, 0x2a2a4e, 0.9).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 80, 'Congratulations!', {
      fontSize: '32px',
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 20, `You have cleared the Tier ${this.currentDelve.tier} Delve!`, {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.createButton(width / 2, height / 2 + 60, 'Exit Delve', () => {
      this.exitDelve();
    });
  }

  private exitDelve(): void {
    // Mark delve as completed
    if (this.currentDelve.location) {
      this.gameState.markDelveCompleted(this.currentDelve.location.x, this.currentDelve.location.y);
      SceneManager.getInstance().transitionTo('explore', {
        returnToLocation: { x: this.currentDelve.location.x, y: this.currentDelve.location.y }
      });
    } else {
      SceneManager.getInstance().transitionTo('explore');
    }
  }

  private getRoomColor(room: DelveRoom, isCurrent: boolean): number {
    if (isCurrent) return 0xffaa00;
    if (room.completed) return 0x00aa00;
    
    switch (room.type) {
      case 'combat': return 0xff4444;
      case 'boss': return 0x8b0000;
      case 'treasure': return 0xffcc00;
      case 'puzzle': return 0x4488ff;
      case 'trap': return 0xff8800;
      default: return 0x888888;
    }
  }

  private getRoomLabel(room: DelveRoom): string {
    if (room.type === 'boss') return 'BOSS';
    return room.type.toUpperCase();
  }

  private getRoomDescription(room: DelveRoom): string {
    switch (room.type) {
      case 'combat':
        return 'Hostile creatures lurk in this chamber.\nPrepare for battle!';
      case 'boss':
        return 'A powerful presence fills this room...\nThe final challenge awaits!';
      case 'treasure':
        return 'Glittering treasure catches your eye.\nClaim your reward!';
      case 'puzzle':
        return 'Ancient mechanisms guard this passage.\nSolve the puzzle to proceed.';
      case 'trap':
        return 'Something feels wrong here...\nProceed with caution.';
      default:
        return 'A mysterious chamber.';
    }
  }

  private startCombat(room: DelveRoom): void {
    if (room.completed) {
      console.warn('Attempted to start combat in already-completed room');
      return;
    }
    SceneManager.getInstance().transitionTo('combat', {
      delve: this.currentDelve,
      room: room,
    });
  }

  private collectTreasure(room: DelveRoom): void {
    if (room.completed) {
      console.warn('Attempted to collect treasure from already-completed room');
      return;
    }
    room.completed = true;
    this.gameState.addArcaneAsh(50 * this.currentDelve.tier);
    this.gameState.addCrystallineAnimus(0.5 * this.currentDelve.tier);
    this.showMessage('Treasure collected!');
    this.scene.restart({ delve: this.currentDelve });
  }

  private solveChallenge(room: DelveRoom): void {
    if (room.completed) {
      console.warn('Attempted to solve already-completed challenge');
      return;
    }
    room.completed = true;
    this.showMessage('Challenge overcome!');
    this.scene.restart({ delve: this.currentDelve });
  }

  private moveToNextRoom(room: DelveRoom): void {
    const nextRoomId = room.connections.find(id => {
      const nextRoom = this.currentDelve.rooms.get(id);
      return nextRoom && !nextRoom.completed;
    });

    if (nextRoomId) {
      this.currentDelve.currentRoomId = nextRoomId;
      this.scene.restart({ delve: this.currentDelve });
    }
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    callback: () => void,
    scrollLocked: boolean = false
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 200, 40, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', callback);

    const label = this.add.text(0, 0, text, {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    
    if (scrollLocked) {
      container.setScrollFactor(0);
    }
    
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
    }, true);
    uiElements.push(quitBtn);

    const cancelBtn = this.createButton(width / 2, height / 2 + 40, 'Cancel', () => {
      destroyAll();
    }, true);
    uiElements.push(cancelBtn);

    this.isOverlayActive = true;
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
      this.menuState = 'none';
      this.currentMenuCloseFunction = null;
    };

    this.currentMenuCloseFunction = destroyAll;
    this.menuState = 'main';

    const inventoryBtn = this.createButton(width / 2, height / 2 - 70, 'Inventory', () => {
      uiElements.forEach(el => el.destroy());
      this.openInventory();
    }, true);
    uiElements.push(inventoryBtn);

    const abandonBtn = this.createButton(width / 2, height / 2 - 10, 'Abandon Delve', () => {
      destroyAll();
      SceneManager.getInstance().transitionTo('explore', { 
        returnToLocation: this.currentDelve.location 
      });
    }, true);
    uiElements.push(abandonBtn);

    const mainMenuBtn = this.createButton(width / 2, height / 2 + 50, 'Return to Main Menu', () => {
      destroyAll();
      this.scene.start('MainMenuScene');
    }, true);
    uiElements.push(mainMenuBtn);

    const closeBtn = this.createButton(width / 2, height / 2 + 130, 'Close', () => {
      destroyAll();
    }, true);
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
    }, true);
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
}
