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
import { StatsPanel } from '../ui/StatsPanel';

export class DelveScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private currentDelve!: Delve;
  private roomDisplay!: Phaser.GameObjects.Container;
  private isOverlayActive: boolean = false;
  private menuState: 'none' | 'main' | 'inventory' | 'quit' = 'none';
  private currentMenuCloseFunction: (() => void) | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;
  private returnToLocation?: { x: number; y: number };
  private statsPanel!: StatsPanel;

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
    const playerData = this.gameState.getPlayer();

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    this.add.text(width / 2, 30, `Delve - Tier ${this.currentDelve.tier}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8844',
    }).setOrigin(0.5);

    // Create stats panel in top-left corner
    this.statsPanel = new StatsPanel(this, 20, 20);
    this.statsPanel.setDepth(100);
    this.statsPanel.update(playerData);

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

    // Update stats panel when room is rendered (e.g., after returning from combat)
    this.updateStatsPanel();

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

    this.createButton(width / 2, height / 2 + 80, 'Exit Delve', async () => {
      await this.exitDelve();
    });
  }

  private async exitDelve(): Promise<void> {
    const player = this.gameState.getPlayer();
    // NOTE: Do NOT reset wildernessRestsRemaining here - that only happens when returning to Roboka (TownScene)
    
    // Award XP for delve completion via server (server-authoritative, persisted to database)
    try {
      const response = await fetch('/api/delve/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier: this.currentDelve.tier }),
      });
      
      if (response.ok) {
        const result = await response.json();
        // Update local player state with server-authoritative values (always sync both)
        player.experience = result.newExperience;
        player.level = result.newLevel;
        
        // Update max stats when leveling up (server-authoritative)
        if (result.leveledUp) {
          if (result.newMaxHealth !== undefined && result.newMaxHealth !== null) {
            player.maxHealth = result.newMaxHealth;
            player.health = result.newMaxHealth; // Full heal on level up
          }
          if (result.newMaxStamina !== undefined && result.newMaxStamina !== null) {
            player.maxStamina = result.newMaxStamina;
            player.stamina = result.newMaxStamina; // Full restore on level up
          }
        }

        // Sync delve progress from server (server-authoritative for Mage Tower)
        if (result.delvesCompletedByTier) {
          player.delvesCompletedByTier = result.delvesCompletedByTier;
        }
      } else {
        console.error('Failed to grant delve completion XP:', await response.text());
      }
    } catch (error) {
      console.error('Error granting delve completion XP:', error);
    }
    
    this.gameState.updatePlayer(player);
    
    // Save current player state to server before exiting - await to ensure state is persisted
    await this.gameState.saveToServer();
    
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
      returnToLocation: this.returnToLocation || this.currentDelve.location || { x: 3000, y: 3000 },
    });
  }

  private collectTreasure(room: DelveRoom): void {
    if (room.completed) {
      console.warn('Attempted to collect treasure from already-completed room');
      return;
    }
    room.completed = true;
    this.gameState.addArcaneAsh(50 * this.currentDelve.tier);
    this.gameState.addCrystallineAnimus(this.currentDelve.tier); // 1 CA per tier (whole numbers only)
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

    // Determine lock complexity (weighted random)
    const complexityRoll = Math.random();
    let lockComplexity: 'simple' | 'finely_made' | 'complex';
    if (complexityRoll < 0.50) {
      lockComplexity = 'simple';
    } else if (complexityRoll < 0.85) {
      lockComplexity = 'finely_made';
    } else {
      lockComplexity = 'complex';
    }

    const lockDescriptions = {
      simple: { text: 'It looks like a simple lock.', dc: 8, color: '#88ff88' },
      finely_made: { text: 'It looks like a finely made lock.', dc: 12, color: '#ffaa44' },
      complex: { text: 'It looks like a very complex lock.', dc: 18, color: '#ff4444' },
    };
    const lockInfo = lockDescriptions[lockComplexity];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 650, 450, 0x2a2a3e).setOrigin(0.5).setDepth(1000);
    uiElements.push(overlay, panel);

    // Header layout matching town NPC style
    const headerBaseY = height / 2 - 180;
    const verticalGap = 50;

    const title = this.add.text(width / 2, headerBaseY, 'Trapped Room!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8844',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(title);

    const mechanismDesc = this.add.text(width / 2, headerBaseY + verticalGap, 
      'You notice a suspicious mechanism near the door.', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(mechanismDesc);

    const lockDesc = this.add.text(width / 2, headerBaseY + verticalGap * 2, 
      lockInfo.text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: lockInfo.color,
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(lockDesc);

    const dcDesc = this.add.text(width / 2, headerBaseY + verticalGap * 3, 
      `Roll to disarm: DC ${lockInfo.dc}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(dcDesc);

    const disarmBtn = this.createButton(width / 2, height / 2 + 100, 'Attempt to Disarm', () => {
      uiElements.forEach(el => el.destroy());
      this.attemptTrapDisarm(room, lockComplexity);
    });
    disarmBtn.setDepth(1002);
    uiElements.push(disarmBtn);

    const cancelBtn = this.createButton(width / 2, height / 2 + 160, 'Leave Room', () => {
      uiElements.forEach(el => el.destroy());
    });
    cancelBtn.setDepth(1002);
    uiElements.push(cancelBtn);
  }

  private attemptTrapDisarm(room: DelveRoom, lockComplexity: 'simple' | 'finely_made' | 'complex'): void {
    const { width, height } = this.cameras.main;
    const uiElements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setDepth(999);
    const panel = this.add.rectangle(width / 2, height / 2, 650, 500, 0x2a2a3e).setOrigin(0.5).setDepth(1000);
    uiElements.push(overlay, panel);

    // DC based on lock complexity
    const dcByComplexity = { simple: 8, finely_made: 12, complex: 18 };
    const dc = dcByComplexity[lockComplexity];
    const roll = DiceRoller.rollD20();
    const success = roll >= dc;

    // Header layout matching town NPC style
    const headerBaseY = height / 2 - 200;
    const verticalGap = 55;

    // Row 1: Title
    const titleText = this.add.text(width / 2, headerBaseY, 'Disarming Trap...', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8844',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(titleText);

    // Row 2: DC info
    const dcText = this.add.text(width / 2, headerBaseY + verticalGap, `Difficulty: DC ${dc}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(dcText);

    // Row 3: Roll result (prominent)
    const resultText = this.add.text(width / 2, headerBaseY + verticalGap * 2, 
      `Rolled: ${roll}${roll === 20 ? ' (CRITICAL!)' : ''}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: success ? '#44ff44' : '#ff4444',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(resultText);

    if (success) {
      this.grantTrapXP(this.currentDelve.tier, room, uiElements, lockComplexity);
    } else {
      this.handleTrapFailure(room, uiElements);
    }
  }

  private async grantTrapXP(tier: number, room: DelveRoom, uiElements: Phaser.GameObjects.GameObject[], lockComplexity: 'simple' | 'finely_made' | 'complex'): Promise<void> {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    
    // Currency rewards based on lock complexity
    // Base: 40-80 AA, 3-6 CA
    // Finely made: 1.5x = 60-120 AA, 5-9 CA
    // Complex: 3.5x = 140-280 AA, 11-21 CA
    const rewardMultipliers = { simple: 1, finely_made: 1.5, complex: 3.5 };
    const multiplier = rewardMultipliers[lockComplexity];
    
    const baseAA = Math.floor(Math.random() * 41) + 40; // 40-80
    const baseCA = Math.floor(Math.random() * 4) + 3;   // 3-6
    const aaReward = Math.floor(baseAA * multiplier);
    const caReward = Math.floor(baseCA * multiplier);
    
    // Award currencies
    this.gameState.addArcaneAsh(aaReward);
    this.gameState.addCrystallineAnimus(caReward);
    
    try {
      const response = await fetch('/api/delve/trap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier }),
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Update local player state with server-authoritative values
        player.experience = result.newExperience;
        player.level = result.newLevel;
        
        // Update max stats when leveling up
        if (result.leveledUp) {
          if (result.newMaxHealth !== undefined && result.newMaxHealth !== null) {
            player.maxHealth = result.newMaxHealth;
            player.health = result.newMaxHealth;
          }
          if (result.newMaxStamina !== undefined && result.newMaxStamina !== null) {
            player.maxStamina = result.newMaxStamina;
            player.stamina = result.newMaxStamina;
          }
        }
        
        this.gameState.updatePlayer(player);
        this.updateStatsPanel();
        
        // Save state after trap interaction
        await this.gameState.saveToServer();
        
        const xpReward = result.xpReward;
        const leveledUp = result.leveledUp;
        const newLevel = result.newLevel;
        
        // Continue clean layout from Row 4
        const headerBaseY = height / 2 - 200;
        const verticalGap = 45;
        const contentY = headerBaseY + verticalGap * 3;
        
        const successMsg = this.add.text(width / 2, contentY, 
          'You carefully disable the trap mechanism!', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#44ff44',
          align: 'center',
        }).setOrigin(0.5).setDepth(1001);
        uiElements.push(successMsg);

        const rewardsText = this.add.text(width / 2, contentY + verticalGap, 
          `+${aaReward} AA  |  +${caReward} CA  |  +${xpReward} XP`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#88ff88',
        }).setOrigin(0.5).setDepth(1001);
        uiElements.push(rewardsText);

        if (leveledUp) {
          const levelUpText = this.add.text(width / 2, contentY + verticalGap * 2, 
            `LEVEL UP! You are now Level ${newLevel}!`, {
            fontFamily: FONTS.primary,
            fontSize: FONTS.size.medium,
            color: '#FFD700',
          }).setOrigin(0.5).setDepth(1001);
          uiElements.push(levelUpText);
        }

        const continueBtn = this.createButton(width / 2, height / 2 + 160, 'Continue', () => {
          room.completed = true;
          this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
        });
        continueBtn.setDepth(1002);
        uiElements.push(continueBtn);
      } else {
        console.error('Failed to grant trap XP:', await response.text());
        const headerBaseY = height / 2 - 200;
        const verticalGap = 45;
        const contentY = headerBaseY + verticalGap * 3;
        
        const errorMsg = this.add.text(width / 2, contentY, 
          `You disabled the trap!\n+${aaReward} AA  |  +${caReward} CA`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#ff8844',
          align: 'center',
        }).setOrigin(0.5).setDepth(1001);
        uiElements.push(errorMsg);
        
        const continueBtn = this.createButton(width / 2, height / 2 + 160, 'Continue', () => {
          room.completed = true;
          this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
        });
        continueBtn.setDepth(1002);
        uiElements.push(continueBtn);
      }
    } catch (error) {
      console.error('Error granting trap XP:', error);
      const headerBaseY = height / 2 - 200;
      const verticalGap = 45;
      const contentY = headerBaseY + verticalGap * 3;
      
      const errorMsg = this.add.text(width / 2, contentY, 
        `You disabled the trap!\n+${aaReward} AA  |  +${caReward} CA`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ff8844',
        align: 'center',
      }).setOrigin(0.5).setDepth(1001);
      uiElements.push(errorMsg);
      
      const continueBtn = this.createButton(width / 2, height / 2 + 160, 'Continue', () => {
        room.completed = true;
        this.scene.restart({ delve: this.currentDelve, returnToLocation: this.returnToLocation });
      });
      continueBtn.setDepth(1002);
      uiElements.push(continueBtn);
    }
  }

  private handleTrapFailure(room: DelveRoom, uiElements: Phaser.GameObjects.GameObject[]): void {
    const { width, height } = this.cameras.main;

    // Continue from Row 4: Failure narrative (below the roll result)
    const headerBaseY = height / 2 - 200;
    const verticalGap = 55;
    const contentY = headerBaseY + verticalGap * 3;

    const failureText = this.add.text(width / 2, contentY, 
      'The mechanism clicks ominously...\nYou hear something trigger behind the wall!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ff8844',
      align: 'center',
      wordWrap: { width: 550 },
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(failureText);

    // Row 5: Choice prompt
    const choiceText = this.add.text(width / 2, contentY + verticalGap, 
      'Quick! What do you do?', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc88',
    }).setOrigin(0.5).setDepth(1001);
    uiElements.push(choiceText);

    const trapType = Math.random() < 0.5 ? 'spike' : 'dart';

    // Buttons at bottom with proper spacing
    const buttonY = height / 2 + 160;
    const duckBtn = this.createButton(width / 2 - 120, buttonY, 'Duck and Hide', () => {
      this.resolveTrapChoice('duck', trapType, room, uiElements);
    });
    duckBtn.setDepth(1002);
    uiElements.push(duckBtn);

    const leapBtn = this.createButton(width / 2 + 120, buttonY, 'Leap to Safety', () => {
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
      this.updateStatsPanel();
      
      // Save state after taking trap damage
      this.gameState.saveToServer();

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
          // Fresh expedition after death - clear delves and explored tiles
          SceneManager.getInstance().transitionTo('town', { freshExpedition: true });
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

    const abandonBtn = this.createButton(width / 2, height / 2 - 10, 'Abandon Delve', async () => {
      destroyAll();
      
      // Save current player state to server before abandoning - await to ensure state is persisted
      await this.gameState.saveToServer();
      
      if (this.currentDelve.location) {
        this.gameState.markDelveCompleted(this.currentDelve.location.x, this.currentDelve.location.y);
      }
      
      const spawnX = this.currentDelve.location ? this.currentDelve.location.x - 100 : 3000;
      const spawnY = this.currentDelve.location ? this.currentDelve.location.y - 100 : 3000;
      
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
    
    // Update stats panel after using potion
    this.updateStatsPanel();
  }
  
  private updateStatsPanel(): void {
    if (this.statsPanel) {
      const player = this.gameState.getPlayer();
      this.statsPanel.update(player);
    }
  }
}
