import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { ItemDatabase } from '../config/ItemDatabase';
import { DiceRoller } from '../utils/DiceRoller';
import { Delve, DelveRoom } from '../types/GameTypes';
import { FONTS } from '../config/fonts';
import { ItemColorUtil } from '../utils/ItemColorUtil';
import { GameConfig } from '../config/GameConfig';
import { AudioManager } from '../managers/AudioManager';
import { getXpReward, getNewLevel } from '../systems/xpSystem';

export class DelveScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private currentDelve!: Delve;
  private roomDisplay!: Phaser.GameObjects.Container;
  private isOverlayActive: boolean = false;
  private menuState: 'none' | 'main' | 'inventory' | 'quit' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;
  private returnToLocation?: { x: number; y: number };

  constructor() {
    super('DelveScene');
  }

  preload() {
    this.load.audio('delve-music', '/assets/audio/delve-music.mp3');
  }

  init(data: { delve: Delve; returnToLocation?: { x: number; y: number } }) {
    this.currentDelve = data.delve;
    this.returnToLocation = data.returnToLocation;
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('delve');

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    this.add.text(width / 2, 30, `Delve - Tier ${this.currentDelve.tier}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
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

    // Play delve music
    const audioManager = AudioManager.getInstance();
    audioManager.switchMusic(this, 'delve-music', true);
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
      // No menu open, open ESC menu
      this.scene.launch('EscMenuScene', { parentKey: this.scene.key });
      this.scene.pause();
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
      const hasBeenVisited = room.completed || isCurrent;
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

      const label = this.add.text(x, y + 35, hasBeenVisited ? this.getRoomLabel(room) : '???', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: hasBeenVisited ? '#cccccc' : '#666666',
        resolution: 2,
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
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
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
      } else if (currentRoom.type === 'trap') {
        this.createButton(width / 2, btnY, 'Investigate Trap', () => {
          this.investigateTrap(currentRoom);
        });
      } else {
        this.createButton(width / 2, btnY, 'Solve Challenge', () => {
          this.solveChallenge(currentRoom);
        });
      }
    } else {
      this.add.text(width / 2, btnY, '✓ Room Cleared', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
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

    this.add.rectangle(width / 2, height / 2, 700, 350, 0x2a2a4e, 0.9).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 100, 'Congratulations!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: '#ffaa00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 40, `You have cleared the Tier ${this.currentDelve.tier} Delve!`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5);
    
    // Show completion bonus XP
    const xpReward = getXpReward(this.currentDelve.tier, 'delveCompletion');
    this.add.text(width / 2, height / 2 + 10, `Completion Bonus: +${xpReward} XP`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#33aacc',
      resolution: 2,
    }).setOrigin(0.5);

    this.createButton(width / 2, height / 2 + 80, 'Exit Delve', () => {
      this.exitDelve();
    });
  }

  private exitDelve(): void {
    const player = this.gameState.getPlayer();
    player.wildernessRestsRemaining = GameConfig.STAMINA.MAX_WILDERNESS_RESTS;
    
    // Award XP for delve completion
    const xpReward = getXpReward(this.currentDelve.tier, 'delveCompletion');
    const oldXp = player.experience;
    const newXp = oldXp + xpReward;
    const newLevel = getNewLevel(oldXp, newXp);
    
    // Update player XP and level
    if (newLevel !== null) {
      player.experience = newXp;
      player.level = newLevel;
    } else {
      player.experience = newXp;
    }
    
    this.gameState.updatePlayer(player);
    
    // Mark delve as completed (only for real map delves with location)
    if (this.currentDelve.location) {
      this.gameState.markDelveCompleted(this.currentDelve.location.x, this.currentDelve.location.y);
      SceneManager.getInstance().transitionTo('explore', {
        returnToLocation: { x: this.currentDelve.location.x, y: this.currentDelve.location.y }
      });
    } else if (this.returnToLocation) {
      // For void portal encounters and other temporary delves, return to stored location
      SceneManager.getInstance().transitionTo('explore', {
        returnToLocation: this.returnToLocation
      });
    } else {
      // Fallback to default explore location (Roboka)
      SceneManager.getInstance().transitionTo('explore');
    }
  }

  private getRoomColor(room: DelveRoom, isCurrent: boolean): number {
    if (isCurrent) return 0xffaa00;
    if (room.completed) return 0x00aa00;
    return 0x888888;
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
      returnToLocation: this.returnToLocation || this.currentDelve.location || { x: 1500, y: 1500 },
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
    this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
  }

  private solveChallenge(room: DelveRoom): void {
    if (room.completed) {
      console.warn('Attempted to solve already-completed challenge');
      return;
    }
    room.completed = true;
    this.showMessage('Challenge overcome!');
    this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
  }

  private investigateTrap(room: DelveRoom): void {
    if (room.completed) {
      console.warn('Attempted to investigate already-completed trap');
      return;
    }

    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 600, 400, 0x2a2a3e).setOrigin(0.5).setDepth(1000);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 160, 'Trapped Room!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8844',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(title);

    const desc = this.add.text(width / 2, height / 2 - 100, 
      'You notice a suspicious mechanism near the door.\nAttempt to disarm it?', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(desc);

    const disarmBtn = this.createButton(width / 2, height / 2, 'Attempt to Disarm', () => {
      uiElements.forEach(el => el.destroy());
      this.attemptTrapDisarm(room);
    });
    disarmBtn.setDepth(1002);
    uiElements.push(disarmBtn);

    const cancelBtn = this.createButton(width / 2, height / 2 + 60, 'Leave Room', () => {
      uiElements.forEach(el => el.destroy());
    });
    cancelBtn.setDepth(1002);
    uiElements.push(cancelBtn);
  }

  private attemptTrapDisarm(room: DelveRoom): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 600, 450, 0x2a2a3e).setOrigin(0.5).setDepth(1000);
    uiElements.push(overlay, panel);

    const dc = 8 + (this.currentDelve.tier - 1) * 2;
    const roll = DiceRoller.rollD20();
    const success = roll >= dc;

    const rollText = this.add.text(width / 2, height / 2 - 150, 
      `Rolling D20 to disarm... (DC ${dc})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffaa44',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(rollText);

    const resultText = this.add.text(width / 2, height / 2 - 100, 
      `Rolled: ${roll}${roll === 20 ? ' (CRITICAL!)' : ''}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: success ? '#44ff44' : '#ff4444',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(resultText);

    if (success) {
      // Award XP for trap disarm
      const player = this.gameState.getPlayer();
      const xpReward = getXpReward(this.currentDelve.tier, 'trap');
      const oldXp = player.experience;
      const newXp = oldXp + xpReward;
      const newLevel = getNewLevel(oldXp, newXp);
      
      // Update player XP and level
      if (newLevel !== null) {
        this.gameState.updatePlayer({ experience: newXp, level: newLevel });
      } else {
        this.gameState.updatePlayer({ experience: newXp });
      }
      
      const successMsg = this.add.text(width / 2, height / 2 - 30, 
        `Success! You carefully disable the trap mechanism.\n+${xpReward} XP${newLevel ? `\n\nLEVEL UP! You are now Level ${newLevel}!` : ''}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: newLevel ? '#FFD700' : '#44ff44',
        align: 'center',
        wordWrap: { width: 550 },
      }).setOrigin(0.5).setDepth(1001);
      uiElements.push(successMsg);

      const continueBtn = this.createButton(width / 2, height / 2 + 80, 'Continue', () => {
        room.completed = true;
        this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
      });
      continueBtn.setDepth(1002);
      uiElements.push(continueBtn);
    } else {
      this.handleTrapFailure(room, uiElements);
    }
  }

  private handleTrapFailure(room: DelveRoom, uiElements: Phaser.GameObjects.GameObject[]): void {
    const { width, height } = this.cameras.main;

    const failureText = this.add.text(width / 2, height / 2 - 30, 
      'You gently pull at a thin string, it breaks just before\nyou can release the lock, you hear a faint click\nbehind the wall.', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ff8844',
      align: 'center',
      wordWrap: { width: 550 },
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(failureText);

    const choiceText = this.add.text(width / 2, height / 2 + 50, 
      'Do you duck and hide or try and leap to safety?', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc88',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(choiceText);

    const trapType = Math.random() < 0.5 ? 'spike' : 'dart';

    const duckBtn = this.createButton(width / 2 - 100, height / 2 + 120, 'Duck and Hide', () => {
      this.resolveTrapChoice('duck', trapType, room, uiElements);
    });
    duckBtn.setDepth(1002);
    uiElements.push(duckBtn);

    const leapBtn = this.createButton(width / 2 + 100, height / 2 + 120, 'Leap to Safety', () => {
      this.resolveTrapChoice('leap', trapType, room, uiElements);
    });
    leapBtn.setDepth(1002);
    uiElements.push(leapBtn);
  }

  private resolveTrapChoice(choice: 'duck' | 'leap', trapType: 'spike' | 'dart', room: DelveRoom, uiElements: Phaser.GameObjects.GameObject[]): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();

    const hitByTrap = (choice === 'duck' && trapType === 'spike') || (choice === 'leap' && trapType === 'dart');

    uiElements.forEach(el => el.destroy());

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 600, 400, 0x2a2a3e).setOrigin(0.5).setDepth(1000);

    if (hitByTrap) {
      const damage = DiceRoller.rollDiceTotal({ numDice: 2, dieSize: 10, modifier: 4 }).total;
      player.health = Math.max(0, player.health - damage);
      this.gameState.updatePlayer(player);

      const trapName = trapType === 'spike' ? 'floor spikes' : 'poison darts';
      const resultText = this.add.text(width / 2, height / 2 - 80, 
        `The trap triggers!\n${trapName.toUpperCase()} shoot out!`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.medium,
        color: '#ff4444',
        align: 'center',
      }).setOrigin(0.5).setDepth(1001);

      const damageText = this.add.text(width / 2, height / 2, 
        `You take ${damage} damage!`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.large,
        color: '#ff0000',
      }).setOrigin(0.5).setDepth(1001);

      const hpText = this.add.text(width / 2, height / 2 + 60, 
        `HP: ${player.health}/${player.maxHealth}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.medium,
        color: player.health < player.maxHealth * 0.3 ? '#ff4444' : '#88ff88',
      }).setOrigin(0.5).setDepth(1001);

      const continueBtn = this.createButton(width / 2, height / 2 + 130, 'Continue', () => {
        if (player.health <= 0) {
          SceneManager.getInstance().transitionTo('town');
        } else {
          room.completed = true;
          this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
        }
      });
      continueBtn.setDepth(1002);
    } else {
      const trapName = trapType === 'spike' ? 'deadly spikes' : 'poison darts';
      const dodgeAction = choice === 'duck' ? 'Duck behind cover' : 'Leap out of the way';
      
      const resultText = this.add.text(width / 2, height / 2 - 60, 
        `${dodgeAction}!\nYou narrowly avoid the ${trapName}!`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.medium,
        color: '#44ff44',
        align: 'center',
      }).setOrigin(0.5).setDepth(1001);

      const successText = this.add.text(width / 2, height / 2 + 20, 
        'You safely navigate past the trap.', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#88ff88',
      }).setOrigin(0.5).setDepth(1001);

      const continueBtn = this.createButton(width / 2, height / 2 + 100, 'Continue', () => {
        room.completed = true;
        this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
      });
      continueBtn.setDepth(1002);
    }
  }

  private moveToNextRoom(room: DelveRoom): void {
    const nextRoomId = room.connections.find(id => {
      const nextRoom = this.currentDelve.rooms.get(id);
      return nextRoom && !nextRoom.completed;
    });

    if (nextRoomId) {
      this.currentDelve.currentRoomId = nextRoomId;
      this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
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
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
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

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0);
    const panel = this.add.rectangle(width / 2, height / 2, 400, 350, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 150, 'Menu', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
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
      
      // Save current player state to localStorage before abandoning
      // Note: getPlayer() returns a reference, so HP/stamina changes are already on the object
      // We just need to ensure it's saved before transitioning
      this.gameState.saveToLocalStorage();
      
      if (this.currentDelve.location) {
        this.gameState.markDelveCompleted(this.currentDelve.location.x, this.currentDelve.location.y);
      }
      
      const spawnX = this.currentDelve.location ? this.currentDelve.location.x - 100 : 1500;
      const spawnY = this.currentDelve.location ? this.currentDelve.location.y - 100 : 1500;
      
      SceneManager.getInstance().transitionTo('explore', { 
        returnToLocation: { x: spawnX, y: spawnY }
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

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setScrollFactor(0);
    const panel = this.add.rectangle(width / 2, height / 2, 700, 500, 0x2a2a3e).setOrigin(0.5).setScrollFactor(0);
    uiElements.push(overlay, panel);

    const title = this.add.text(width / 2, height / 2 - 220, `Inventory (${player.inventory.reduce((sum, item) => sum + item.quantity, 0)}/${player.inventorySlots})`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
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
    const itemHeight = 28;
    const maxDisplay = 14;

    let displayedItems = 0;
    player.inventory.forEach((invItem, index) => {
      if (displayedItems >= maxDisplay) return;

      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) return;

      const y = itemsStartY + displayedItems * itemHeight;
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemLabel = this.add.text(width / 2 - 320, y, `${item.name} x${invItem.quantity}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: itemColor,
      }).setScrollFactor(0);
      uiElements.push(itemLabel);

      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (isPotion) {
        const useBtn = this.add.text(width / 2 + 120, y, '[Use]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.xsmall,
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
}
