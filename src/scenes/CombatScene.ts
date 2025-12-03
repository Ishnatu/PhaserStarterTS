import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { CombatSystem } from '../systems/CombatSystem';
import { ServerCombatController } from '../systems/ServerCombatController';
import { EnemyFactory } from '../systems/EnemyFactory';
import { ItemDatabase } from '../config/ItemDatabase';
import { DiceRoller } from '../utils/DiceRoller';
import { Delve, DelveRoom, Enemy, PlayerEquipment, InventoryItem, WeaponAttack, CombatState } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';
import { DurabilityManager } from '../systems/DurabilityManager';
import { FONTS } from '../config/fonts';
import { ItemColorUtil } from '../utils/ItemColorUtil';
import { ApiClient } from '../utils/ApiClient';
import { WeaponAttackDatabase } from '../config/WeaponAttackDatabase';
import { ConditionManager } from '../systems/ConditionManager';
import { EquipmentManager } from '../systems/EquipmentManager';
import { AudioManager } from '../managers/AudioManager';
import { getXpReward, hasLeveledUp, getNewLevel } from '../systems/xpSystem';
import { PixelArtBar } from '../utils/PixelArtBar';

export class CombatScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private combatSystem!: CombatSystem;
  private serverCombat!: ServerCombatController;
  private useServerCombat: boolean = true;
  private currentDelve!: Delve;
  private currentRoom!: DelveRoom;
  private logText!: Phaser.GameObjects.Text;
  private logContainer!: Phaser.GameObjects.Container;
  private logMask!: Phaser.GameObjects.Graphics;
  private logScrollY: number = 0;
  private logHeight: number = 140;
  private logY: number = 20;
  private playerHealthBar!: PixelArtBar;
  private playerStaminaBar!: PixelArtBar;
  private playerHealthText!: Phaser.GameObjects.Text;
  private playerStaminaText!: Phaser.GameObjects.Text;
  private enemyContainers: Phaser.GameObjects.Container[] = [];
  private enemyHealthTexts: Phaser.GameObjects.Text[] = [];
  private enemyHealthBars: PixelArtBar[] = [];
  private isWildEncounter: boolean = false;
  private wildEnemies?: Enemy[];
  private isOverlayActive: boolean = false;
  private actionButtons: Phaser.GameObjects.Container[] = [];
  private attackButtons: Phaser.GameObjects.Container[] = [];
  private attackAreaBg?: Phaser.GameObjects.Rectangle;
  private attackPageIndex: number = 0;
  private paginationButtons: Phaser.GameObjects.GameObject[] = [];
  private readonly ATTACK_GRID_COLUMNS = 2;
  private readonly ATTACK_GRID_ROWS = 2;
  private readonly MAX_ATTACKS_PER_PAGE = 4;
  private returnToLocation?: { x: number; y: number };
  private selectedAttack?: WeaponAttack;
  private attackUIElements: Phaser.GameObjects.GameObject[] = [];
  private statusIndicators: Map<number, Phaser.GameObjects.Container[]> = new Map();
  private isTargetSelectionMode: boolean = false;
  private actionCounterText!: Phaser.GameObjects.Text;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private previousPlayerHealth: number = 0;
  private escKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super('CombatScene');
  }

  preload() {
    this.load.image('player-combat', '/assets/player/player-combat.png');
    this.load.image('void-spawn', '/assets/enemies/void-spawn.png');
    this.load.image('greater-void-spawn', '/assets/enemies/greater-void-spawn.png');
    this.load.image('shadow-beast', '/assets/enemies/shadow-beast.png');
    this.load.image('skitterthid', '/assets/enemies/skitterthid.png');
    this.load.image('aetherbear', '/assets/enemies/aetherbear.png');
    this.load.image('hollow-husk', '/assets/enemies/hollow-husk.png');
    this.load.image('crawley-crow', '/assets/enemies/crawley-crow.png');
    this.load.image('wailing-wisp', '/assets/enemies/wisp.png');
    this.load.image('combat-background', '/assets/combat-background.png');
    this.load.image('wilderness-combat-background', '/assets/wilderness-combat-background.png');
    this.load.image('bleed-icon', '/assets/ui/bleed_icon.png');
    this.load.image('poison-icon', '/assets/ui/poison_icon.png');
    this.load.audio('combat-music', '/assets/audio/combat-music.mp3');
  }

  init(data: { delve: Delve; room: DelveRoom; wildEncounter?: boolean; wildEnemies?: Enemy[]; returnToLocation?: { x: number; y: number } }) {
    console.log('CombatScene init - received data:', {
      hasDelve: !!data.delve,
      delve: data.delve,
      hasTier: data.delve ? data.delve.tier : 'no delve',
      hasRoom: !!data.room,
      roomType: data.room ? data.room.type : 'no room'
    });
    
    this.currentDelve = data.delve;
    
    // Fix missing tier (happens when delve is serialized between scenes)
    if (this.currentDelve && this.currentDelve.tier === undefined) {
      console.error('CombatScene: currentDelve or tier is undefined!', this.currentDelve);
      this.currentDelve.tier = 1; // Default to tier 1
    }
    
    this.currentRoom = data.room;
    this.isWildEncounter = data.wildEncounter || false;
    this.wildEnemies = data.wildEnemies;
    this.returnToLocation = data.returnToLocation;
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('combat');
    this.combatSystem = new CombatSystem();
    this.serverCombat = new ServerCombatController();

    this.enemyContainers = [];
    this.enemyHealthTexts = [];
    this.enemyHealthBars = [];
    this.actionButtons = [];
    this.isOverlayActive = false;

    const { width, height } = this.cameras.main;

    // Add the appropriate background based on encounter type
    const backgroundKey = this.isWildEncounter ? 'wilderness-combat-background' : 'combat-background';
    const background = this.add.image(width / 2, height / 2, backgroundKey);
    
    // Scale to cover the entire screen while maintaining aspect ratio
    const scaleX = width / background.width;
    const scaleY = height / background.height;
    const scale = Math.max(scaleX, scaleY);
    background.setScale(scale);

    const titleText = this.add.text(width / 2, height / 2, this.currentRoom.type === 'boss' ? 'BOSS BATTLE!' : 'Combat Begins!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: this.currentRoom.type === 'boss' ? '#ff0000' : '#ff8844',
      resolution: 2,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: titleText,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      delay: 500,
      onComplete: () => {
        titleText.destroy();
      }
    });

    // Get enemy names for server-authoritative combat
    const enemyNames = this.getEnemyNames();
    
    if (this.useServerCombat) {
      // SERVER-AUTHORITATIVE: Initiate combat via server
      this.initiateCombatViaServer(enemyNames);
    } else {
      // LEGACY: Local combat (for fallback only)
      const enemies = this.generateEnemies();
      const player = this.gameState.getPlayer();
      this.combatSystem.initiateCombat(player, enemies);
      this.renderPlayer();
      this.renderEnemies(enemies);
      this.renderCombatLog();
      this.renderActionButtons();
      this.renderWeaponAttacks();
    }

    // ESC key for menu
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => {
      if (!this.isOverlayActive) {
        this.scene.launch('EscMenuScene', { parentKey: this.scene.key });
        this.scene.pause();
      }
    });

    // Save previous music and switch to combat music
    const audioManager = AudioManager.getInstance();
    audioManager.savePreviousMusic();
    audioManager.switchMusic(this, 'combat-music', true);
  }

  private getEnemyNames(): string[] {
    // For wild encounters, use the pre-generated enemy names
    if (this.isWildEncounter && this.wildEnemies) {
      return this.wildEnemies.map(e => e.name);
    }

    // For delve encounters, generate enemy names based on tier
    if (!this.currentDelve || !this.currentDelve.tier) {
      return ['Void Spawn'];
    }

    const tier = this.currentDelve.tier;
    const isBoss = this.currentRoom.type === 'boss';
    
    if (isBoss) {
      // Get boss name for this tier
      const bossEnemy = EnemyFactory.createEnemy(tier, true);
      return [bossEnemy.name];
    }

    // Generate 1-2 random enemies for the tier
    const numEnemies = Math.floor(Math.random() * 2) + 1;
    const names: string[] = [];
    for (let i = 0; i < numEnemies; i++) {
      const enemy = EnemyFactory.createEnemy(tier, false);
      names.push(enemy.name);
    }
    return names;
  }

  private async initiateCombatViaServer(enemyNames: string[]): Promise<void> {
    try {
      console.log('[SERVER COMBAT] Initiating combat via server with enemies:', enemyNames);
      
      // CRITICAL: Ensure game is saved before combat so server has player data
      // This fixes the "No save found" issue for new players
      console.log('[SERVER COMBAT] Ensuring game save exists before combat...');
      await this.gameState.saveToServer();
      
      const result = await this.serverCombat.initiateCombat(enemyNames, this.isWildEncounter);
      
      if (!result.success) {
        throw new Error('Server combat initiation failed');
      }

      console.log('[SERVER COMBAT] Combat initiated successfully, combat sessionId:', result.sessionId);
      
      // Store sessionId on delve for loot claiming
      // IMPORTANT: Only set if not already set - wilderness/delve sessions are created BEFORE combat
      // and have proper prefixes (wild_, delve_) that the loot API requires for validation
      if (this.currentDelve && !(this.currentDelve as any).sessionId) {
        console.log('[SERVER COMBAT] Setting sessionId from combat result (no prior session)');
        (this.currentDelve as any).sessionId = result.sessionId;
      } else if (this.currentDelve) {
        console.log('[SERVER COMBAT] Preserving existing sessionId:', (this.currentDelve as any).sessionId);
      }

      // Get enemies from server combat state
      const enemies = result.combatState.enemies;
      
      // Also initialize local combat system with server state for display purposes
      const player = this.gameState.getPlayer();
      this.combatSystem.initiateCombat(player, enemies, this.isWildEncounter);
      
      // Sync local state with server state
      this.syncLocalStateWithServer(result.combatState);

      // Render UI
      this.renderPlayer();
      this.renderEnemies(enemies);
      this.renderCombatLog();
      this.renderActionButtons();
      this.renderWeaponAttacks();
      
      // Update display to reflect server state
      this.updateCombatDisplayFromServerState(result.combatState);
      
    } catch (error) {
      console.error('[SERVER COMBAT] Failed to initiate combat:', error);
      
      // Fallback to local combat if server fails
      console.warn('[SERVER COMBAT] Falling back to local combat');
      this.useServerCombat = false;
      
      const enemies = this.generateEnemies();
      const player = this.gameState.getPlayer();
      this.combatSystem.initiateCombat(player, enemies);
      this.renderPlayer();
      this.renderEnemies(enemies);
      this.renderCombatLog();
      this.renderActionButtons();
      this.renderWeaponAttacks();
    }
  }

  private syncLocalStateWithServer(serverState: CombatState): void {
    const localState = this.combatSystem.getCombatState();
    if (!localState) {
      console.error('[SYNC] No local state to sync!');
      return;
    }
    
    // DEBUG: Log sync operation
    console.log('[SYNC] Syncing server state:', {
      serverPlayerVictory: serverState.playerVictory,
      serverIsComplete: serverState.isComplete,
      localPlayerVictoryBefore: localState.playerVictory,
      localIsCompleteBefore: localState.isComplete,
    });
    
    // Sync player stats
    localState.player.health = serverState.player.health;
    localState.player.stamina = serverState.player.stamina;
    localState.actionsRemaining = serverState.actionsRemaining;
    localState.currentTurn = serverState.currentTurn;
    localState.combatLog = [...serverState.combatLog];
    
    // CRITICAL: Sync combat completion state (victory/defeat)
    // This was missing and caused "Victory" log but "Defeat" screen!
    localState.isComplete = serverState.isComplete;
    localState.playerVictory = serverState.playerVictory;
    
    // DEBUG: Verify sync worked
    console.log('[SYNC] After sync:', {
      localPlayerVictoryAfter: localState.playerVictory,
      localIsCompleteAfter: localState.isComplete,
    });
    
    // Sync enemy states
    serverState.enemies.forEach((serverEnemy, index) => {
      if (localState.enemies[index]) {
        localState.enemies[index].health = serverEnemy.health;
        localState.enemies[index].statusConditions = serverEnemy.statusConditions || [];
      }
    });
  }

  private updateCombatDisplayFromServerState(serverState: CombatState): void {
    // Update player HP/SP bars
    this.playerHealthBar?.update(serverState.player.health, serverState.player.maxHealth);
    this.playerStaminaBar?.update(serverState.player.stamina, serverState.player.maxStamina);
    
    // Update action counter
    if (this.actionCounterText) {
      this.actionCounterText.setText(`Actions: ${serverState.actionsRemaining}/${serverState.maxActionsPerTurn}`);
    }
    
    // Update enemy health
    serverState.enemies.forEach((enemy, index) => {
      const healthBar = this.enemyHealthBars[index];
      const healthText = this.enemyHealthTexts[index];
      const container = this.enemyContainers[index];
      
      if (healthBar) {
        healthBar.update(enemy.health, enemy.maxHealth);
      }
      if (healthText) {
        healthText.setText(`HP: ${enemy.health}/${enemy.maxHealth}`);
      }
      if (container && enemy.health <= 0) {
        container.setAlpha(0.3);
      }
    });
    
    // Update combat log
    if (this.logText) {
      const allLogs = serverState.combatLog.join('\n');
      this.logText.setText(allLogs);
      
      // Auto-scroll to bottom
      const textHeight = this.logText.height;
      const visibleHeight = this.logHeight - 20;
      const maxScroll = Math.max(0, textHeight - visibleHeight);
      this.logScrollY = maxScroll;
      this.logText.y = 10 - this.logScrollY;
    }
    
    this.refreshAttackButtons();
  }

  private generateEnemies(): Enemy[] {
    if (this.isWildEncounter && this.wildEnemies) {
      return this.wildEnemies;
    }

    if (!this.currentDelve || !this.currentDelve.tier) {
      console.error('CombatScene: currentDelve or tier is undefined!', this.currentDelve);
      return [EnemyFactory.createEnemy(1, false)];
    }

    const tier = this.currentDelve.tier;
    const isBoss = this.currentRoom.type === 'boss';
    
    if (isBoss) {
      return [EnemyFactory.createEnemy(tier, true)];
    }

    const numEnemies = Math.floor(Math.random() * 2) + 1;
    const enemies: Enemy[] = [];

    for (let i = 0; i < numEnemies; i++) {
      enemies.push(EnemyFactory.createEnemy(tier, false));
    }

    return enemies;
  }

  private renderPlayer(): void {
    const { width, height } = this.cameras.main;
    
    // Different positioning for wilderness vs delve combat
    let playerX: number;
    let playerY: number;
    
    if (this.isWildEncounter) {
      // Wilderness: position on left side of dirt path
      playerX = 380;
      playerY = height - 360;
    } else {
      // Delve: position on bottom left platform
      playerX = 260;
      playerY = height - 280;
    }

    this.playerSprite = this.add.sprite(playerX, playerY, 'player-combat');
    this.playerSprite.setScale(0.24);
    
    const player = this.gameState.getPlayer();
    
    // Ensure we have valid health/stamina values (defensive coding)
    const displayHealth = player.health || 0;
    const displayMaxHealth = player.maxHealth || 100;
    const displayStamina = player.stamina || 0;
    const displayMaxStamina = player.maxStamina || 50;
    
    this.previousPlayerHealth = displayHealth;
    
    console.log('[COMBAT] renderPlayer - health:', displayHealth, '/', displayMaxHealth, 'stamina:', displayStamina, '/', displayMaxStamina);
    
    // Player info panel with HP/SP bars (Pink area - top left)
    const panelX = 20;
    const panelY = 20;
    const panelWidth = 320;
    const panelHeight = 140;
    
    const playerInfoBg = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x2a2a3e, 0.9).setOrigin(0);
    
    // Player name and level
    this.add.text(panelX + 10, panelY + 10, 'YOU', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      fontStyle: 'bold',
      resolution: 2,
    });

    this.add.text(panelX + panelWidth - 10, panelY + 10, `Lv ${player.level}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffcc00',
      resolution: 2,
    }).setOrigin(1, 0);

    // HP Bar
    this.playerHealthBar = new PixelArtBar(
      this,
      panelX + 10,
      panelY + 35,
      'HP',
      0xcc3333,  // Red fill
      0x4a5a8a,  // Blue-gray empty
      panelWidth - 20,
      30
    );
    this.playerHealthBar.update(displayHealth, displayMaxHealth);

    // SP Bar
    this.playerStaminaBar = new PixelArtBar(
      this,
      panelX + 10,
      panelY + 75,
      'SP',
      0xccaa33,  // Yellow-gold fill
      0x4a5a6a,  // Gray empty
      panelWidth - 20,
      30
    );
    this.playerStaminaBar.update(displayStamina, displayMaxStamina);

    // Hidden text elements for backward compatibility (used in updateCombatDisplay)
    this.playerHealthText = this.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);
    this.playerStaminaText = this.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);
  }

  private getEnemySpriteKey(enemyName: string): string | null {
    return EnemyFactory.getSpriteKey(enemyName);
  }

  private renderEnemies(enemies: Enemy[]): void {
    const { height } = this.cameras.main;
    
    // Fixed positioning based on user's visual markers - uniform for all enemy types
    // Delve: Left X at 650, Right X at 830, Center at 740, Y at 240
    // Wilderness: Same X positions, Y adjusted for ground level
    const DELVE_LEFT_X = 650;
    const DELVE_RIGHT_X = 830;
    const DELVE_CENTER_X = 740;  // Midpoint between left and right
    const DELVE_Y = 240;
    const SPACING = 180;  // Distance between two enemies
    
    let platformCenterX: number;
    let platformY: number;
    
    if (this.isWildEncounter) {
      // Wilderness: same horizontal positions, adjusted vertical for ground
      platformCenterX = DELVE_CENTER_X;
      platformY = height - 420;
    } else {
      // Delve: use the exact coordinates from user's markers
      platformCenterX = DELVE_CENTER_X;
      platformY = DELVE_Y;
    }
    
    // Position enemies using fixed coordinates - uniform for all monster types
    let enemyPositions: { x: number, y: number }[];
    if (enemies.length === 1) {
      // Single enemy: exactly at center point
      enemyPositions = [{ x: platformCenterX, y: platformY }];
    } else if (enemies.length === 2) {
      // Two enemies: use exact left and right marker positions
      const leftX = this.isWildEncounter ? DELVE_LEFT_X : DELVE_LEFT_X;
      const rightX = this.isWildEncounter ? DELVE_RIGHT_X : DELVE_RIGHT_X;
      enemyPositions = [
        { x: leftX, y: platformY },
        { x: rightX, y: platformY }
      ];
    } else {
      // 3+ enemies: distribute evenly around center point
      const totalWidth = (enemies.length - 1) * SPACING;
      const startX = platformCenterX - totalWidth / 2;
      enemyPositions = enemies.map((_, index) => ({
        x: startX + (index * SPACING),
        y: platformY
      }));
    }

    enemies.forEach((enemy, index) => {
      const x = enemyPositions[index].x;
      const y = enemyPositions[index].y;

      const spriteKey = this.getEnemySpriteKey(enemy.name);
      let enemyVisual: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
      
      if (spriteKey) {
        enemyVisual = this.add.sprite(x, y, spriteKey);
        // Boss enemies are 20% larger to emphasize their importance
        const scale = EnemyFactory.isBossEnemy(enemy.name) ? 0.24 : 0.2;
        enemyVisual.setScale(scale);
      } else {
        enemyVisual = this.add.rectangle(x, y, 80, 80, 0xff4444);
      }
      
      // HP bar positioned above the sprite with clearance for head height
      const hpBarY = y - 150;
      const hpBar = new PixelArtBar(
        this,
        x - 80,
        hpBarY,
        'HP',
        0xcc3333,
        0x4a5a8a,
        160,
        20
      );
      hpBar.update(enemy.health, enemy.maxHealth);
      this.enemyHealthBars.push(hpBar);

      // Hidden text element for backward compatibility
      const healthText = this.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);
      this.enemyHealthTexts.push(healthText);

      const container = this.add.container(0, 0, [enemyVisual]);
      container.setData('index', index);
      this.enemyContainers.push(container);

      enemyVisual.setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          if (!this.isOverlayActive && this.combatSystem.isPlayerTurn()) {
            if (spriteKey && enemyVisual instanceof Phaser.GameObjects.Sprite) {
              enemyVisual.setTint(0xff6666);
            } else if (enemyVisual instanceof Phaser.GameObjects.Rectangle) {
              enemyVisual.setFillStyle(0xff6666);
            }
          }
        })
        .on('pointerout', () => {
          if (spriteKey && enemyVisual instanceof Phaser.GameObjects.Sprite) {
            enemyVisual.clearTint();
          } else if (enemyVisual instanceof Phaser.GameObjects.Rectangle) {
            enemyVisual.setFillStyle(0xff4444);
          }
        })
        .on('pointerdown', () => {
          if (!this.isOverlayActive && this.isTargetSelectionMode) {
            this.attackEnemyWithSelectedAttack(index);
          }
        });
    });
  }

  private renderCombatLog(): void {
    const { width, height } = this.cameras.main;
    // Green area - Combat log (top center/right, wide)
    const logX = 360;
    this.logY = 20;
    const logWidth = width - 380 - 250;  // Leave space for player panel and sidebar
    this.logHeight = 140;

    // Background panel
    const logBg = this.add.rectangle(logX, this.logY, logWidth, this.logHeight, 0x1a1a2e, 0.8).setOrigin(0);
    
    // Create container for scrollable log text
    this.logContainer = this.add.container(logX, this.logY);
    
    // Create log text inside container
    this.logText = this.add.text(10, 10, 'Combat begins!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      align: 'left',
      wordWrap: { width: logWidth - 30 },
      resolution: 2,
    });
    this.logContainer.add(this.logText);
    
    // Create mask for scrolling
    this.logMask = this.make.graphics({ x: 0, y: 0 });
    this.logMask.fillStyle(0xffffff);
    this.logMask.fillRect(logX, this.logY, logWidth, this.logHeight);
    this.logContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, this.logMask));
    
    // Add scroll indicator text
    const scrollHint = this.add.text(logX + logWidth - 10, this.logY + this.logHeight - 12, '[scroll]', {
      fontFamily: FONTS.primary,
      fontSize: '8px',
      color: '#666666',
    }).setOrigin(1, 1);
    
    // Mouse wheel scrolling for log area
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: any[], deltaX: number, deltaY: number) => {
      // Check if pointer is over log area
      if (pointer.x >= logX && pointer.x <= logX + logWidth &&
          pointer.y >= this.logY && pointer.y <= this.logY + this.logHeight) {
        this.scrollLog(deltaY);
      }
    });
    
    this.logScrollY = 0;
  }
  
  private scrollLog(deltaY: number): void {
    const textHeight = this.logText.height;
    const visibleHeight = this.logHeight - 20;  // Account for padding
    const maxScroll = Math.max(0, textHeight - visibleHeight);
    
    // Scroll speed factor
    const scrollSpeed = 0.5;
    this.logScrollY = Phaser.Math.Clamp(
      this.logScrollY + deltaY * scrollSpeed,
      0,
      maxScroll
    );
    
    // Update text position within container
    this.logText.y = 10 - this.logScrollY;
  }

  private renderActionButtons(): void {
    const { width, height } = this.cameras.main;
    const menuX = width - 250;
    const menuY = height - 180;

    const menuBg = this.add.rectangle(menuX, menuY, 230, 160, 0x2a2a3e, 0.95).setOrigin(0);

    const state = this.combatSystem.getCombatState();
    const actionsRemaining = state?.actionsRemaining || 0;
    const maxActions = state?.maxActionsPerTurn || 2;

    this.actionCounterText = this.add.text(menuX + 115, menuY + 15, `Actions: ${actionsRemaining}/${maxActions}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#00ff00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const inventoryBtn = this.createActionButton(menuX + 20, menuY + 45, 'Inventory', () => {
      this.openInventory();
    });
    this.actionButtons.push(inventoryBtn);

    const runBtn = this.createActionButton(menuX + 20, menuY + 90, 'Run', () => {
      this.attemptRun();
    });
    this.actionButtons.push(runBtn);

    const endTurnBtn = this.createActionButton(menuX + 20, menuY + 120, 'End Turn', () => {
      this.endPlayerTurn();
    });
    this.actionButtons.push(endTurnBtn);
  }

  private createActionButton(
    x: number,
    y: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 190, 35, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        const state = this.combatSystem.getCombatState();
        const hasActions = state && state.actionsRemaining > 0;
        if (text === 'Inventory') {
          if (hasActions) bg.setFillStyle(0x555577);
        } else {
          bg.setFillStyle(0x555577);
        }
      })
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', () => {
        if (!this.isOverlayActive && this.combatSystem.isPlayerTurn()) {
          const state = this.combatSystem.getCombatState();
          const hasActions = state && state.actionsRemaining > 0;
          if (text === 'Inventory' && !hasActions) {
            this.showMessage('Not enough actions!');
            return;
          }
          callback();
        }
      });

    const label = this.add.text(0, 0, text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5);

    return this.add.container(x + 95, y + 17.5, [bg, label]);
  }

  private renderWeaponAttacks(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const availableAttacks = EquipmentManager.getAvailableAttacks(player);
    
    // Orange box area - Bottom attack buttons
    const attackAreaX = 20;
    const attackAreaY = height - 190;
    const attackAreaWidth = width - 290;  // Leave space for sidebar
    const attackAreaHeight = 170;
    
    // Create or reuse background rectangle (prevent layer stacking)
    if (!this.attackAreaBg) {
      this.attackAreaBg = this.add.rectangle(attackAreaX, attackAreaY, attackAreaWidth, attackAreaHeight, 0x2a2a3e, 0.95).setOrigin(0);
    }
    
    // Guard against zero attacks
    if (availableAttacks.length === 0) {
      const noAttacksText = this.add.text(attackAreaX + attackAreaWidth / 2, attackAreaY + attackAreaHeight / 2, 
        'No weapons equipped', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#888888',
      }).setOrigin(0.5);
      this.attackButtons.push(this.add.container(0, 0, [noAttacksText]));
      return;
    }
    
    // Fixed 2x2 grid layout with pagination
    const totalPages = Math.max(1, Math.ceil(availableAttacks.length / this.MAX_ATTACKS_PER_PAGE));
    
    // Clamp page index to valid range when attack count changes
    this.attackPageIndex = Math.max(0, Math.min(this.attackPageIndex, totalPages - 1));
    
    const currentPageAttacks = availableAttacks.slice(
      this.attackPageIndex * this.MAX_ATTACKS_PER_PAGE,
      (this.attackPageIndex + 1) * this.MAX_ATTACKS_PER_PAGE
    );
    
    // Calculate button dimensions for fixed 2-column layout
    const attackBoxWidth = (attackAreaWidth - 30) / this.ATTACK_GRID_COLUMNS;  // Wider buttons
    const attackBoxHeight = 70;
    const spacing = 10;
    const startX = attackAreaX + 10;
    const startY = attackAreaY + 10;
    
    currentPageAttacks.forEach((attack, index) => {
      const col = index % this.ATTACK_GRID_COLUMNS;
      const row = Math.floor(index / this.ATTACK_GRID_COLUMNS);
      const x = startX + col * (attackBoxWidth + spacing);
      const y = startY + row * (attackBoxHeight + spacing);
      
      this.createAttackButtonBox(x, y, attackBoxWidth, attackBoxHeight, attack, player.stamina);
    });
    
    // Add pagination controls if needed
    if (totalPages > 1) {
      this.createPaginationControls(attackAreaX, attackAreaY, attackAreaWidth, attackAreaHeight, totalPages);
    }
  }

  private createPaginationControls(areaX: number, areaY: number, areaWidth: number, areaHeight: number, totalPages: number): void {
    const btnY = areaY + areaHeight - 25;
    const btnWidth = 60;
    const btnHeight = 20;
    
    // Previous button
    const prevBg = this.add.rectangle(areaX + 10, btnY, btnWidth, btnHeight, 
      this.attackPageIndex > 0 ? 0x444466 : 0x333344).setOrigin(0);
    const prevText = this.add.text(areaX + 10 + btnWidth / 2, btnY + btnHeight / 2, '< Prev', {
      fontFamily: FONTS.primary,
      fontSize: '10px',
      color: this.attackPageIndex > 0 ? '#ffffff' : '#666666',
    }).setOrigin(0.5);
    
    if (this.attackPageIndex > 0) {
      prevBg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => prevBg.setFillStyle(0x555577))
        .on('pointerout', () => prevBg.setFillStyle(0x444466))
        .on('pointerdown', () => {
          this.attackPageIndex--;
          this.refreshAttackButtons();
        });
    }
    
    // Next button
    const nextBg = this.add.rectangle(areaX + areaWidth - btnWidth - 10, btnY, btnWidth, btnHeight,
      this.attackPageIndex < totalPages - 1 ? 0x444466 : 0x333344).setOrigin(0);
    const nextText = this.add.text(areaX + areaWidth - btnWidth - 10 + btnWidth / 2, btnY + btnHeight / 2, 'Next >', {
      fontFamily: FONTS.primary,
      fontSize: '10px',
      color: this.attackPageIndex < totalPages - 1 ? '#ffffff' : '#666666',
    }).setOrigin(0.5);
    
    if (this.attackPageIndex < totalPages - 1) {
      nextBg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => nextBg.setFillStyle(0x555577))
        .on('pointerout', () => nextBg.setFillStyle(0x444466))
        .on('pointerdown', () => {
          this.attackPageIndex++;
          this.refreshAttackButtons();
        });
    }
    
    // Page indicator
    const pageText = this.add.text(areaX + areaWidth / 2, btnY + btnHeight / 2, 
      `${this.attackPageIndex + 1} / ${totalPages}`, {
      fontFamily: FONTS.primary,
      fontSize: '10px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
    
    this.paginationButtons.push(prevBg, prevText, nextBg, nextText, pageText);
  }

  private createAttackButtonBox(x: number, y: number, width: number, height: number, attack: WeaponAttack, playerStamina: number): void {
    const state = this.combatSystem.getCombatState();
    const hasEnoughActions = state && state.actionsRemaining >= attack.actionCost;
    const canAffordStamina = playerStamina >= attack.staminaCost;
    const canUse = canAffordStamina && hasEnoughActions;
    
    const baseColor = canUse ? 0x444466 : 0x333344;
    const hoverColor = canUse ? 0x555577 : 0x444455;
    
    const bg = this.add.rectangle(x, y, width, height, baseColor).setOrigin(0);
    
    // Create tooltip elements with dynamic sizing (hidden by default)
    let tooltipBg: Phaser.GameObjects.Rectangle | null = null;
    let tooltipText: Phaser.GameObjects.Text | null = null;
    
    if (attack.specialEffect) {
      // Create text first to measure its bounds
      tooltipText = this.add.text(0, 0, attack.specialEffect, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.xsmall,
        color: '#aaaaff',
        wordWrap: { width: 350 },  // Max width for wrapping
      }).setOrigin(0, 0).setVisible(false).setDepth(10001);
      
      // Measure text bounds and add padding
      const padding = 16;
      const textBounds = tooltipText.getBounds();
      const tooltipWidth = Math.min(400, textBounds.width + padding);
      const tooltipHeight = textBounds.height + padding;
      
      tooltipBg = this.add.rectangle(0, 0, tooltipWidth, tooltipHeight, 0x1a1a2e, 0.95)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x4a4a6a)
        .setVisible(false)
        .setDepth(10000);
    }
    
    if (canUse) {
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', (pointer: Phaser.Input.Pointer) => {
          bg.setFillStyle(hoverColor);
          if (tooltipBg && tooltipText) {
            tooltipBg.setVisible(true);
            tooltipText.setVisible(true);
            // Position tooltip 20px right of cursor, clamped to viewport
            const { width: screenWidth } = this.cameras.main;
            const tooltipX = Math.min(pointer.x + 20, screenWidth - tooltipBg.width - 10);
            tooltipBg.setPosition(tooltipX, pointer.y);
            tooltipText.setPosition(tooltipX + 8, pointer.y + 8);
          }
        })
        .on('pointerout', () => {
          bg.setFillStyle(baseColor);
          if (tooltipBg && tooltipText) {
            tooltipBg.setVisible(false);
            tooltipText.setVisible(false);
          }
        })
        .on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (tooltipBg && tooltipText && tooltipBg.visible) {
            // Position tooltip 20px right of cursor, clamped to viewport
            const { width: screenWidth } = this.cameras.main;
            const tooltipX = Math.min(pointer.x + 20, screenWidth - tooltipBg.width - 10);
            tooltipBg.setPosition(tooltipX, pointer.y);
            tooltipText.setPosition(tooltipX + 8, pointer.y + 8);
          }
        })
        .on('pointerdown', () => {
          if (!this.isOverlayActive && this.combatSystem.isPlayerTurn()) {
            this.selectAttackDirect(attack);
          }
        });
    } else {
      bg.setAlpha(0.5);
    }
    
    let nameColor = '#00ff00';
    if (!canAffordStamina) {
      nameColor = '#ff0000';
    } else if (!hasEnoughActions) {
      nameColor = '#888888';
    }
    
    // Attack name only (no hand labels)
    const nameText = this.add.text(x + width / 2, y + 10, attack.name, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: nameColor,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    
    const staminaText = this.add.text(x + 8, y + 35, `STAM ${attack.staminaCost}`, {
      fontFamily: FONTS.primary,
      fontSize: '11px',
      color: canAffordStamina ? '#ffcc00' : '#ff0000',
    });
    
    const actionText = this.add.text(x + width - 8, y + 35, `ATK ${attack.actionCost}`, {
      fontFamily: FONTS.primary,
      fontSize: '11px',
      color: hasEnoughActions ? '#ffffff' : '#888888',
    }).setOrigin(1, 0);
    
    // No special effect text rendered directly on button anymore
    const elements = [bg, nameText, staminaText, actionText];
    if (tooltipBg && tooltipText) {
      elements.push(tooltipBg, tooltipText);
    }
    this.attackButtons.push(this.add.container(0, 0, elements));
  }

  private selectAttackDirect(attack: WeaponAttack): void {
    const state = this.combatSystem.getCombatState();
    if (!state || state.actionsRemaining < attack.actionCost) {
      this.showMessage('Not enough actions!');
      return;
    }
    
    this.selectedAttack = attack;
    
    const isAoE = attack.name.includes('Arcing') || attack.name.includes('Spinning Flurry');
    
    if (isAoE) {
      this.executeAoEAttack();
    } else {
      this.showMessage('Select Target');
      this.isTargetSelectionMode = true;
      this.enableEnemyTargeting();
    }
  }

  private refreshAttackButtons(): void {
    // Destroy old attack buttons
    this.attackButtons.forEach(btn => btn.destroy());
    this.attackButtons = [];
    
    // Destroy old pagination buttons
    this.paginationButtons.forEach(btn => btn.destroy());
    this.paginationButtons = [];
    
    // Recreate attack buttons with current state
    this.renderWeaponAttacks();
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
      this.isOverlayActive = false;
    };

    this.isOverlayActive = true;

    const itemsStartY = height / 2 - 180;
    const itemHeight = 30;
    const maxDisplay = 12;

    let displayedItems = 0;
    player.inventory.forEach((invItem, index) => {
      if (displayedItems >= maxDisplay) return;

      const item = ItemDatabase.getItem(invItem.itemId);
      if (!item) return;

      const y = itemsStartY + displayedItems * itemHeight;
      
      const itemColor = ItemColorUtil.getItemColor(invItem.enhancementLevel, invItem.isShiny);
      const itemLabel = this.add.text(width / 2 - 320, y, `${item.name} x${invItem.quantity}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: itemColor,
      });
      uiElements.push(itemLabel);

      const isPotion = ItemDatabase.getPotion(invItem.itemId);

      if (isPotion) {
        const useBtn = this.add.text(width / 2 + 120, y, '[Use]', {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: '#8888ff',
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.usePotion(invItem.itemId);
            destroyAll();
          });
        uiElements.push(useBtn);
      }

      displayedItems++;
    });

    const closeBtn = this.createMenuButton(width / 2, height / 2 + 220, 'Close', () => {
      destroyAll();
    });
    uiElements.push(closeBtn);
  }

  private usePotion(itemId: string): void {
    const player = this.gameState.getPlayer();
    const potion = ItemDatabase.getPotion(itemId);
    const combatState = this.combatSystem.getCombatState();
    
    if (!potion || !combatState) return;

    const restorationRoll = DiceRoller.rollDiceTotal(potion.restoration);
    const amount = restorationRoll.total;

    // Use combat state values for current HP/Stamina during combat
    if (potion.type === 'health') {
      const newHealth = Math.min(player.maxHealth, combatState.player.health + amount);
      player.health = newHealth;
      this.combatSystem.updatePlayerHealth(newHealth);
      this.showMessage(`Used ${potion.name}! Restored ${amount} HP`);
    } else if (potion.type === 'stamina') {
      const newStamina = Math.min(player.maxStamina, combatState.player.stamina + amount);
      player.stamina = newStamina;
      this.combatSystem.updatePlayerStamina(newStamina);
      this.showMessage(`Used ${potion.name}! Restored ${amount} Stamina`);
    }

    this.gameState.removeItemFromInventory(itemId, 1);
    this.gameState.updatePlayer(player);

    this.combatSystem.deductActions(1);
    this.updateCombatDisplay();

    const state = this.combatSystem.getCombatState();
    const shouldEndTurn = state && state.actionsRemaining <= 0;

    this.time.delayedCall(1000, () => {
      if (!this.combatSystem.isCombatComplete()) {
        if (shouldEndTurn) {
          this.enemyTurn();
        }
      } else {
        this.endCombat();
      }
    });
  }

  private usePotionNoTurnEnd(itemId: string): void {
    const player = this.gameState.getPlayer();
    const potion = ItemDatabase.getPotion(itemId);
    const combatState = this.combatSystem.getCombatState();
    
    if (!potion || !combatState) return;

    const restorationRoll = DiceRoller.rollDiceTotal(potion.restoration);
    const amount = restorationRoll.total;

    // Use combat state values for current HP/Stamina during combat
    if (potion.type === 'health') {
      const newHealth = Math.min(player.maxHealth, combatState.player.health + amount);
      player.health = newHealth;
      this.combatSystem.updatePlayerHealth(newHealth);
    } else if (potion.type === 'stamina') {
      const newStamina = Math.min(player.maxStamina, combatState.player.stamina + amount);
      player.stamina = newStamina;
      this.combatSystem.updatePlayerStamina(newStamina);
    }

    this.gameState.removeItemFromInventory(itemId, 1);
    this.gameState.updatePlayer(player);
    this.updateCombatDisplay();
  }

  private attemptRun(): void {
    if (this.useServerCombat) {
      this.executeServerRun();
      return;
    }
    
    const state = this.combatSystem.getCombatState();
    
    // Running costs 1 action
    if (!state || state.actionsRemaining < 1) {
      this.showMessage('Not enough actions to run!');
      return;
    }
    
    // Consume 1 action for the run attempt
    this.combatSystem.deductActions(1);
    this.updateCombatDisplay();
    
    let baseChance = 0.5;
    
    if (ConditionManager.hasCondition(state.player, 'slowed')) {
      baseChance = 0.25;
      this.showMessage('The void goo makes it harder to run! (25% flee chance)');
      this.time.delayedCall(1000, () => {
        this.executeRunAttempt(baseChance);
      });
    } else {
      this.executeRunAttempt(baseChance);
    }
  }

  private async executeServerRun(): Promise<void> {
    try {
      this.showMessage('Attempting to flee...');
      
      const result = await this.serverCombat.attemptRun();
      
      if (result.fled) {
        this.showMessage('Successfully escaped!');
        
        // Sync state from server
        this.syncLocalStateWithServer(result.combatState);
        
        // Save player state
        this.gameState.updatePlayer({
          health: result.combatState.player.health,
          stamina: result.combatState.player.stamina,
        });
        await this.gameState.saveToServer();
        
        this.time.delayedCall(1500, () => {
          if (this.isWildEncounter) {
            SceneManager.getInstance().transitionTo('explore', { returnToLocation: this.returnToLocation });
          } else {
            SceneManager.getInstance().transitionTo('delve', { 
              delve: this.currentDelve,
              returnToLocation: this.returnToLocation 
            });
          }
        });
      } else {
        // Server handles the run attempt - just update display
        this.syncLocalStateWithServer(result.combatState);
        this.updateCombatDisplayFromServerState(result.combatState);
      }
      
    } catch (error) {
      console.error('[SERVER COMBAT] Run attempt failed:', error);
      this.showMessage('Failed to flee! Try again.');
    }
  }

  private async executeRunAttempt(successChance: number): Promise<void> {
    const runChance = Math.random();
    
    if (runChance < successChance) {
      this.showMessage('Successfully escaped!');
      
      // Save current combat HP/SP state before fleeing
      const state = this.combatSystem.getCombatState();
      if (state) {
        this.gameState.updatePlayer({
          health: state.player.health,
          stamina: state.player.stamina,
          inventory: state.player.inventory,
        });
        await this.gameState.saveToServer();
      }
      
      this.time.delayedCall(1500, () => {
        if (this.isWildEncounter) {
          SceneManager.getInstance().transitionTo('explore', { returnToLocation: this.returnToLocation });
        } else {
          SceneManager.getInstance().transitionTo('delve', { 
            delve: this.currentDelve,
            returnToLocation: this.returnToLocation 
          });
        }
      });
    } else {
      const state = this.combatSystem.getCombatState();
      
      // If player still has actions remaining, let them continue their turn
      if (state && state.actionsRemaining > 0) {
        this.showMessage('Failed to escape! You still have actions remaining.');
      } else {
        this.showMessage('Failed to escape!');
        // End the player turn properly so enemy turn can proceed
        this.combatSystem.endPlayerTurn();
        this.time.delayedCall(1500, () => {
          this.enemyTurn();
        });
      }
    }
  }

  private attackEnemyWithSelectedAttack(targetIndex: number): void {
    if (!this.combatSystem.isPlayerTurn() || !this.selectedAttack) return;

    this.isTargetSelectionMode = false;
    this.disableEnemyTargeting();

    const player = this.gameState.getPlayer();
    const staminaCost = this.selectedAttack.staminaCost;
    
    if (player.stamina < staminaCost) {
      const staminaPotionItem = player.inventory.find(item => item.itemId === 'potion_stamina');
      
      if (staminaPotionItem && staminaPotionItem.quantity > 0) {
        this.showMessage('Exhausted! Automatically using Stamina Potion...');
        this.usePotionNoTurnEnd('potion_stamina');
        
        this.time.delayedCall(1500, () => {
          const updatedPlayer = this.gameState.getPlayer();
          if (updatedPlayer.stamina >= staminaCost) {
            this.executeAttackWithSelection(targetIndex);
          } else {
            this.showMessage('Still exhausted after potion! Must flee combat!');
            this.selectedAttack = undefined;
            this.time.delayedCall(1500, () => {
              this.attemptRun();
            });
          }
        });
      } else {
        this.showMessage('Exhausted with no stamina potions! Must flee combat!');
        this.selectedAttack = undefined;
        this.time.delayedCall(1500, () => {
          this.attemptRun();
        });
      }
    } else {
      this.executeAttackWithSelection(targetIndex);
    }
  }

  private attackEnemy(targetIndex: number): void {
    if (!this.combatSystem.isPlayerTurn()) return;

    const player = this.gameState.getPlayer();
    const staminaCost = GameConfig.COMBAT.STAMINA_COST_PER_ATTACK;
    
    if (player.stamina < staminaCost) {
      const staminaPotionItem = player.inventory.find(item => item.itemId === 'potion_stamina');
      
      if (staminaPotionItem && staminaPotionItem.quantity > 0) {
        this.showMessage('Exhausted! Automatically using Stamina Potion...');
        this.usePotionNoTurnEnd('potion_stamina');
        
        this.time.delayedCall(1500, () => {
          const updatedPlayer = this.gameState.getPlayer();
          if (updatedPlayer.stamina >= staminaCost) {
            this.executeAttack(targetIndex);
          } else {
            this.showMessage('Still exhausted after potion! Must flee combat!');
            this.time.delayedCall(1500, () => {
              this.attemptRun();
            });
          }
        });
      } else {
        this.showMessage('Exhausted with no stamina potions! Must flee combat!');
        this.time.delayedCall(1500, () => {
          this.attemptRun();
        });
      }
    } else {
      this.executeAttack(targetIndex);
    }
  }

  private executeAttackWithSelection(targetIndex: number): void {
    if (!this.selectedAttack) {
      this.showMessage('No attack selected!');
      return;
    }
    
    this.playLungeAnimation();
    
    this.time.delayedCall(200, () => {
      if (this.useServerCombat) {
        this.executeServerAttack(targetIndex, this.selectedAttack!.name);
        this.selectedAttack = undefined;
      } else {
        const result = this.combatSystem.playerAttack(targetIndex, this.selectedAttack!);
        this.selectedAttack = undefined;
        this.updateCombatDisplay();

        this.time.delayedCall(1000, () => {
          if (this.combatSystem.isCombatComplete()) {
            this.endCombat();
          } else {
            const state = this.combatSystem.getCombatState();
            if (state && state.currentTurn === 'enemy') {
              this.enemyTurn();
            }
          }
        });
      }
    });
  }

  private executeAttack(targetIndex: number): void {
    const attacks = this.getAvailableAttacks();
    if (attacks.length === 0) {
      this.showMessage('No attacks available!');
      return;
    }
    
    const defaultAttack = attacks[0];
    this.playLungeAnimation();
    
    this.time.delayedCall(200, () => {
      if (this.useServerCombat) {
        this.executeServerAttack(targetIndex, defaultAttack.name);
      } else {
        const result = this.combatSystem.playerAttack(targetIndex, defaultAttack);
        this.updateCombatDisplay();

        this.time.delayedCall(1000, () => {
          if (this.combatSystem.isCombatComplete()) {
            this.endCombat();
          } else {
            const state = this.combatSystem.getCombatState();
            if (state && state.currentTurn === 'enemy') {
              this.enemyTurn();
            }
          }
        });
      }
    });
  }

  private async executeServerAttack(targetIndex: number, attackName: string): Promise<void> {
    try {
      const state = this.combatSystem.getCombatState();
      if (!state) return;
      
      const targetEnemy = state.enemies[targetIndex];
      if (!targetEnemy) {
        this.showMessage('Invalid target!');
        return;
      }

      console.log('[SERVER COMBAT] Executing attack:', attackName, 'on target:', targetEnemy.id);
      
      const result = await this.serverCombat.performAttack(attackName, targetEnemy.id);
      
      // Sync local state with server response
      this.syncLocalStateWithServer(result.combatState);
      this.updateCombatDisplayFromServerState(result.combatState);
      
      this.time.delayedCall(1000, () => {
        if (result.combatEnded) {
          this.endCombat();
        } else if (result.combatState.currentTurn === 'enemy') {
          this.enemyTurn();
        }
      });
      
    } catch (error) {
      console.error('[SERVER COMBAT] Attack failed:', error);
      this.showMessage('Attack failed! Try again.');
    }
  }

  private endPlayerTurn(): void {
    this.showMessage('Ending turn...');
    this.time.delayedCall(500, () => {
      if (this.useServerCombat) {
        this.executeServerEndTurn();
      } else {
        this.enemyTurn();
      }
    });
  }

  private async executeServerEndTurn(): Promise<void> {
    try {
      console.log('[SERVER COMBAT] Ending player turn via server');
      
      const result = await this.serverCombat.endTurn();
      
      // Sync local state with server response
      this.syncLocalStateWithServer(result.combatState);
      this.updateCombatDisplayFromServerState(result.combatState);
      
      this.time.delayedCall(1000, () => {
        if (result.combatEnded) {
          this.endCombat();
        }
        // Server handles all turn processing - when it returns, it's player's turn or combat ended
        // No need to manually call enemyTurn() as server already processed enemy actions
      });
      
    } catch (error) {
      console.error('[SERVER COMBAT] End turn failed:', error);
      this.showMessage('End turn failed! Try again.');
    }
  }

  private enemyTurn(): void {
    if (this.useServerCombat) {
      // In server-authoritative mode, enemy turns are processed by server via endTurn
      // The server returns the updated state after enemy actions
      this.executeServerEndTurn();
      return;
    }
    
    // Legacy local enemy turn processing
    this.combatSystem.enemyTurnStart();
    this.updateCombatDisplay();
    
    const logs = this.combatSystem.enemyTurn();
    this.updateCombatDisplay();
    
    this.combatSystem.enemyTurnEnd();
    this.updateCombatDisplay();

    if (this.combatSystem.isCombatComplete()) {
      this.time.delayedCall(1000, () => this.endCombat());
    } else {
      this.combatSystem.playerTurnStart();
      this.updateCombatDisplay();
      
      // Check if player died from condition damage (poison/bleed) at start of turn
      if (this.combatSystem.isCombatComplete()) {
        this.time.delayedCall(1000, () => this.endCombat());
        return;
      }
      
      // If player is stunned, playerTurnStart() switches to enemy turn
      const state = this.combatSystem.getCombatState();
      if (state && state.currentTurn === 'enemy') {
        this.time.delayedCall(1000, () => this.enemyTurn());
      }
    }
  }

  private updateCombatDisplay(): void {
    const state = this.combatSystem.getCombatState();
    if (!state) return;

    console.log(`[UI UPDATE] Updating combat display - Enemy count: ${state.enemies.length}`);
    state.enemies.forEach((enemy, i) => {
      console.log(`[UI UPDATE] Enemy ${i} (${enemy.name}): ${enemy.health}/${enemy.maxHealth} HP`);
    });

    // Update HP/SP bars
    this.playerHealthBar.update(state.player.health, state.player.maxHealth);
    this.playerStaminaBar.update(state.player.stamina, state.player.maxStamina);

    if (this.actionCounterText) {
      this.actionCounterText.setText(`Actions: ${state.actionsRemaining}/${state.maxActionsPerTurn}`);
    }

    // Refresh attack buttons to show current availability
    this.refreshAttackButtons();

    if (state.player.health < this.previousPlayerHealth) {
      this.playHitFlashAnimation();
    }
    this.previousPlayerHealth = state.player.health;

    state.enemies.forEach((enemy, index) => {
      const healthText = this.enemyHealthTexts[index];
      const healthBar = this.enemyHealthBars[index];
      const container = this.enemyContainers[index];
      
      if (healthText) {
        healthText.setText(`HP: ${enemy.health}/${enemy.maxHealth}`);
      }
      
      if (healthBar) {
        healthBar.update(enemy.health, enemy.maxHealth);
      }
      
      if (container && enemy.health <= 0) {
        container.setAlpha(0.3);
      }
    });

    // Show all combat logs and auto-scroll to bottom
    const allLogs = state.combatLog.join('\n');
    this.logText.setText(allLogs);
    
    // Auto-scroll to bottom when new logs appear
    const textHeight = this.logText.height;
    const visibleHeight = this.logHeight - 20;
    const maxScroll = Math.max(0, textHeight - visibleHeight);
    this.logScrollY = maxScroll;
    this.logText.y = 10 - this.logScrollY;
    
    this.updateStatusIndicators();
  }

  private playHitFlashAnimation(): void {
    if (!this.playerSprite) return;

    const flashDuration = 150;
    const flashCount = 3;
    
    for (let i = 0; i < flashCount; i++) {
      this.time.delayedCall(i * flashDuration * 2, () => {
        this.tweens.add({
          targets: this.playerSprite,
          tint: 0xff3333,
          duration: flashDuration,
          yoyo: true,
          ease: 'Sine.easeInOut'
        });
      });
    }
  }

  private playLungeAnimation(): void {
    if (!this.playerSprite) return;

    const originalX = this.playerSprite.x;
    
    this.tweens.add({
      targets: this.playerSprite,
      x: originalX + 40,
      duration: 150,
      ease: 'Power2',
      yoyo: true,
      onComplete: () => {
        this.playerSprite.x = originalX;
      }
    });
  }

  private async endCombat(): Promise<void> {
    // CRITICAL FIX: In server-authoritative mode, read state from ServerCombatController
    // The local CombatSystem may have stale/reset state after sync operations
    // ServerCombatController.getCombatState() holds the authoritative server response
    let state: CombatState | null;
    
    if (this.useServerCombat) {
      state = this.serverCombat.getCombatState();
      console.log('[endCombat] Using SERVER combat state (authoritative)');
    } else {
      state = this.combatSystem.getCombatState();
      console.log('[endCombat] Using LOCAL combat state');
    }
    
    if (!state) {
      console.error('[endCombat] No combat state!');
      return;
    }

    // DEBUG: Log combat state for victory/defeat determination
    console.log('[endCombat] Reading state for victory check:', {
      playerVictory: state.playerVictory,
      isComplete: state.isComplete,
      playerHealth: state.player.health,
      enemyCount: state.enemies.length,
      enemies: state.enemies.map(e => ({ name: e.name, health: e.health })),
      allEnemiesDead: state.enemies.every(e => e.health <= 0),
    });

    this.gameState.updatePlayer({
      health: state.player.health,
      stamina: state.player.stamina,
    });

    if (state.playerVictory) {
      this.currentRoom.completed = true;
      
      const player = this.gameState.getPlayer();
      
      // Apply durability decay after combat
      const weaponDecayMessages = DurabilityManager.decayWeaponsAfterCombat(player);
      const armorDecayMessages = DurabilityManager.decayArmorAfterCombat(player);
      const durabilityMessages = [...weaponDecayMessages, ...armorDecayMessages];
      
      // Auto-unequip broken items
      const brokenMessages = DurabilityManager.unequipBrokenItems(player);
      durabilityMessages.push(...brokenMessages);
      
      // Save durability changes
      this.gameState.updatePlayer(player);
      
      // SERVER-AUTHORITATIVE: Roll loot and rewards via API for each enemy
      // This persists AA and XP to the database immediately
      const isBossEncounter = state.enemies.some(enemy => enemy.isBoss);
      let totalAaReward = 0;
      let totalXpReward = 0;
      let serverNewLevel: number | null = null;
      let serverNewExperience: number = player.experience;
      const allLoot: Array<{ itemId: string; enhancementLevel?: number }> = [];
      
      let totalCaReward = 0;
      
      // Define item tracking arrays outside try block for proper scoping
      interface LootItemInfo {
        name: string;
        enhancementLevel: number;
        isShiny: boolean;
      }
      const itemsAdded: LootItemInfo[] = [];
      const itemsFailed: LootItemInfo[] = [];
      
      try {
        // Call server for each enemy to get loot and rewards
        console.log(`[endCombat] About to request loot for ${state.enemies.length} enemies`);
        for (const enemy of state.enemies) {
          // Ensure enemy has valid tier (default to 1 if missing)
          const enemyTier = typeof enemy.tier === 'number' ? enemy.tier : 1;
          console.log(`[endCombat] Requesting loot for: ${enemy.name} (tier ${enemyTier}, boss: ${enemy.isBoss})`);
          
          // Retry logic for transient network errors
          let response: Response | null = null;
          let lastError: Error | null = null;
          const maxRetries = 3;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              // [SECURITY] Pass sessionId for tier validation
              // Delve combat uses delve_ prefix, wilderness uses wild_ prefix
              const sessionId = this.currentDelve 
                ? (this.currentDelve as any).sessionId 
                : undefined;
              
              response = await fetch('/api/loot/roll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  sessionId, // Server validates tier against session (delve_ or wild_)
                  enemyName: enemy.name || 'Unknown Enemy',
                  tier: enemyTier,
                  isBoss: enemy.isBoss || false,
                  playerLevel: player.level,
                }),
              });
              
              if (response.ok) {
                break; // Success, exit retry loop
              }
              
              // Non-retriable error (4xx)
              if (response.status >= 400 && response.status < 500) {
                const errorText = await response.text();
                console.error(`Loot API error for ${enemy.name}: ${response.status} - ${errorText}`);
                throw new Error(`Loot API failed: ${response.status}`);
              }
              
              // Server error (5xx) - retry
              console.warn(`Loot API attempt ${attempt}/${maxRetries} failed with ${response.status}, retrying...`);
              lastError = new Error(`Loot API failed: ${response.status}`);
            } catch (fetchError) {
              // Network error - retry
              console.warn(`Loot API attempt ${attempt}/${maxRetries} network error:`, fetchError);
              lastError = fetchError as Error;
            }
            
            // Wait before retry (exponential backoff: 500ms, 1000ms, 2000ms)
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
            }
          }

          if (!response || !response.ok) {
            console.error(`Loot API failed after ${maxRetries} attempts:`, lastError);
            throw lastError || new Error('Loot API failed after retries');
          }
          
          const result = await response.json();
          console.log('Loot API response:', result);
          
          // Accumulate rewards
          totalAaReward += result.loot?.arcaneAsh || 0;
          totalCaReward += result.loot?.crystallineAnimus || 0;
          totalXpReward += result.xpReward || 0;
          
          // Collect loot items
          if (result.loot?.items) {
            allLoot.push(...result.loot.items);
          }
          
          // Update server-authoritative values
          if (result.newArcaneAsh !== undefined) {
            player.arcaneAsh = result.newArcaneAsh;
          }
          if (result.newCrystallineAnimus !== undefined) {
            player.crystallineAnimus = result.newCrystallineAnimus;
          }
          if (result.leveledUp) {
            serverNewLevel = result.newLevel;
            // Update max stats when leveling up (server-authoritative)
            if (result.newMaxHealth !== undefined && result.newMaxHealth !== null) {
              player.maxHealth = result.newMaxHealth;
              // Also heal to new max on level up (standard RPG mechanic)
              player.health = result.newMaxHealth;
            }
            if (result.newMaxStamina !== undefined && result.newMaxStamina !== null) {
              player.maxStamina = result.newMaxStamina;
              // Also restore stamina on level up
              player.stamina = result.newMaxStamina;
            }
          }
          serverNewExperience = result.newExperience;
        }
        
        // Update player with server-authoritative level/XP
        player.level = serverNewLevel !== null ? serverNewLevel : player.level;
        player.experience = serverNewExperience;
        this.gameState.updatePlayer(player);
        
        // CRITICAL: Add loot items to inventory BEFORE save to prevent loss on disconnect
        // Items must be persisted before showing victory screen
        for (const lootItem of allLoot) {
          const item = ItemDatabase.getItem(lootItem.itemId);
          if (item) {
            const targetEnhancement = lootItem.enhancementLevel || 0;
            if (this.gameState.addItemToInventory(lootItem.itemId, 1, targetEnhancement)) {
              // Find the most recently added item by matching both itemId and enhancementLevel
              const updatedPlayer = this.gameState.getPlayer();
              const addedItem = updatedPlayer.inventory.slice().reverse().find(invItem => 
                invItem.itemId === lootItem.itemId && invItem.enhancementLevel === targetEnhancement
              );
              itemsAdded.push({
                name: item.name,
                enhancementLevel: addedItem?.enhancementLevel || targetEnhancement,
                isShiny: addedItem?.isShiny || false
              });
            } else {
              itemsFailed.push({
                name: item.name,
                enhancementLevel: targetEnhancement,
                isShiny: false
              });
            }
          }
        }
        
        // Save state after combat victory (persists HP/SP, durability, AND inventory with new items)
        await this.gameState.saveToServer();
        
      } catch (error) {
        console.error('Error rolling loot from server:', error);
        // Show error and return to wilderness without rewards (server-authoritative - no fallback)
        this.showRewardError();
        return;
      }
      
      this.showVictoryScreen(totalAaReward, totalCaReward, totalXpReward, serverNewLevel, itemsAdded, itemsFailed, durabilityMessages);
    } else {
      // Save state after combat defeat (persists HP/SP state)
      await this.gameState.saveToServer();
      this.showDefeatScreen();
    }
  }

  private showVictoryScreen(
    aa: number, 
    ca: number, 
    xp: number, 
    newLevel: number | null, 
    itemsAdded: Array<{ name: string; enhancementLevel: number; isShiny: boolean }>,
    itemsFailed: Array<{ name: string; enhancementLevel: number; isShiny: boolean }>,
    durabilityMessages: string[]
  ): void {
    const { width, height } = this.cameras.main;
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
    
    // Show LEVEL UP! if player leveled up
    const victoryText = newLevel !== null ? 'LEVEL UP!' : 'VICTORY!';
    const victoryColor = newLevel !== null ? '#FFD700' : '#00ff00';
    
    this.add.text(width / 2, height / 2 - 100, victoryText, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: victoryColor,
    }).setOrigin(0.5);
    
    // Show new level if applicable
    if (newLevel !== null) {
      this.add.text(width / 2, height / 2 - 60, `You are now Level ${newLevel}!`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#FFD700',
        resolution: 2,
      }).setOrigin(0.5);
    }

    const baseRewardText = `Rewards:\n+${aa} AA\n+${ca.toFixed(1)} CA\n+${xp} XP`;
    
    let currentY = height / 2 - 20;
    const lineHeight = 20;
    
    this.add.text(width / 2, currentY, baseRewardText, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);
    
    currentY += (baseRewardText.split('\n').length * lineHeight) + 10;
    
    if (itemsAdded.length > 0) {
      this.add.text(width / 2, currentY, 'Loot:', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);
      currentY += lineHeight;
      
      itemsAdded.forEach(lootItem => {
        const itemColor = ItemColorUtil.getItemColor(lootItem.enhancementLevel, lootItem.isShiny);
        this.add.text(width / 2, currentY, `• ${lootItem.name}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: itemColor,
          align: 'center',
        }).setOrigin(0.5);
        currentY += lineHeight;
      });
      
      currentY += 10;
    }
    
    if (itemsFailed.length > 0) {
      this.add.text(width / 2, currentY, 'Inventory Full:', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);
      currentY += lineHeight;
      
      itemsFailed.forEach(lootItem => {
        const itemColor = ItemColorUtil.getItemColor(lootItem.enhancementLevel, lootItem.isShiny);
        this.add.text(width / 2, currentY, `• ${lootItem.name}`, {
          fontFamily: FONTS.primary,
          fontSize: FONTS.size.small,
          color: itemColor,
          align: 'center',
        }).setOrigin(0.5);
        currentY += lineHeight;
      });
      
      currentY += 10;
    }
    
    if (durabilityMessages.length > 0) {
      const durabilityText = durabilityMessages.join('\n');
      this.add.text(width / 2, currentY, durabilityText, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);
    }

    this.createMenuButton(width / 2, height / 2 + 120, 'Continue', () => {
      // Restore previous music before leaving combat
      const audioManager = AudioManager.getInstance();
      audioManager.restorePreviousMusic(this);
      
      if (this.isWildEncounter) {
        SceneManager.getInstance().transitionTo('explore', { returnToLocation: this.returnToLocation });
      } else {
        SceneManager.getInstance().transitionTo('delve', { 
          delve: this.currentDelve,
          returnToLocation: this.returnToLocation 
        });
      }
    });
  }

  private showRewardError(): void {
    const { width, height } = this.cameras.main;
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    
    this.add.text(width / 2, height / 2 - 40, 'CONNECTION ERROR', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff6666',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, 'Failed to claim rewards.\nYour victory was not recorded.', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5);

    this.createMenuButton(width / 2, height / 2 + 60, 'Continue', () => {
      if (this.isWildEncounter) {
        SceneManager.getInstance().transitionTo('explore', { returnToLocation: this.returnToLocation });
      } else {
        SceneManager.getInstance().transitionTo('delve', { 
          delve: this.currentDelve,
          returnToLocation: this.returnToLocation 
        });
      }
    });
  }

  private async showDefeatScreen(): Promise<void> {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    
    this.add.text(width / 2, height / 2 - 120, 'DEFEATED', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: '#ff0000',
    }).setOrigin(0.5);

    // Handle soulbound items - CRITICAL: null means API failure, [] means no bindings
    const soulboundSlots = await ApiClient.getSoulboundSlots();
    if (soulboundSlots === null) {
      // API failure - preserve all equipment to prevent data loss
      this.add.text(width / 2, height / 2 - 60, 
        'Connection lost. All equipment preserved.\nYour soul returns to Roboka...', {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#cccccc',
        align: 'center',
      }).setOrigin(0.5);

      this.createMenuButton(width / 2, height / 2 + 40, 'Return to Town', () => {
        this.gameState.updatePlayer({ 
          health: player.maxHealth,
          stamina: player.maxStamina,
        });
        
        // Stop combat music before returning to town
        const audioManager = AudioManager.getInstance();
        audioManager.stopMusic(true);
        
        // Fresh expedition after death - clear delves and explored tiles
        SceneManager.getInstance().transitionTo('town', { freshExpedition: true });
      });
      return;
    }

    const unboundItems: { slot: keyof PlayerEquipment; item: InventoryItem }[] = [];
    
    // Separate equipment into soulbound and unbound
    const equipmentSlots: (keyof PlayerEquipment)[] = ['mainHand', 'offHand', 'helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape'];
    for (const slot of equipmentSlots) {
      const equippedItem = player.equipment[slot];
      if (equippedItem && !soulboundSlots.includes(slot)) {
        // Convert EquippedItem to InventoryItem
        const inventoryItem: InventoryItem = {
          ...equippedItem,
          quantity: 1
        };
        unboundItems.push({ slot, item: inventoryItem });
      }
    }

    let statusMessage = '';
    if (soulboundSlots.length > 0 && unboundItems.length === 0) {
      statusMessage = 'All your equipment was soulbound.\nIt returns with your soul to Roboka.';
    } else if (unboundItems.length > 0) {
      statusMessage = `${unboundItems.length} unbound item(s) left at your corpse.\nSoulbound items return with you.`;
    } else {
      statusMessage = 'Your soul returns to Roboka...';
    }

    this.add.text(width / 2, height / 2 - 60, statusMessage, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5);

    // Create tombstone if there are unbound items
    if (unboundItems.length > 0) {
      // Use stored return location for tombstone position
      const deathLocation = this.returnToLocation || player.position || { x: 3000, y: 3000 };
      
      await ApiClient.createTombstone({
        ownerName: 'Player',  // Use generic name for now
        worldX: deathLocation.x,
        worldY: deathLocation.y,
        items: unboundItems.map(ui => ui.item),
        expiresInHours: 24
      });

      // Remove unbound items from equipment
      for (const { slot } of unboundItems) {
        player.equipment[slot] = undefined;
      }
    }

    this.createMenuButton(width / 2, height / 2 + 40, 'Return to Town', () => {
      this.gameState.updatePlayer({ 
        health: player.maxHealth,
        stamina: player.maxStamina,
        equipment: player.equipment,
      });
      
      // Stop combat music before returning to town
      const audioManager = AudioManager.getInstance();
      audioManager.stopMusic(true);
      
      // Fresh expedition after death - clear delves and explored tiles
      SceneManager.getInstance().transitionTo('town', { freshExpedition: true });
    });
  }

  private createMenuButton(
    x: number,
    y: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 200, 50, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', callback);

    const label = this.add.text(0, 0, text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
    }).setOrigin(0.5);

    return this.add.container(x, y, [bg, label]);
  }

  private getAvailableAttacks(): WeaponAttack[] {
    const player = this.gameState.getPlayer();
    const attacks: WeaponAttack[] = [];
    
    const mainHandItem = player.equipment.mainHand;
    const offHandItem = player.equipment.offHand;
    
    if (mainHandItem) {
      const mainHandWeapon = ItemDatabase.getWeapon(mainHandItem.itemId);
      if (mainHandWeapon) {
        const weaponAttacks = WeaponAttackDatabase.getAttacksForWeapon(mainHandWeapon.type);
        attacks.push(...weaponAttacks);
      }
    }
    
    if (offHandItem) {
      const offHandWeapon = ItemDatabase.getWeapon(offHandItem.itemId);
      const offHandArmor = ItemDatabase.getArmor(offHandItem.itemId);
      
      if (offHandWeapon && !offHandWeapon.twoHanded) {
        const weaponAttacks = WeaponAttackDatabase.getAttacksForWeapon(offHandWeapon.type);
        const dualWieldAttacks = weaponAttacks.filter(a => !a.requiresDualWield || (mainHandItem && !ItemDatabase.getWeapon(mainHandItem.itemId)?.twoHanded));
        attacks.push(...dualWieldAttacks);
      } else if (offHandArmor && offHandArmor.slot === 'shield') {
        if (offHandItem.itemId === 'shield_steel') {
          attacks.push(...WeaponAttackDatabase.getAttacksForWeapon('steel_shield'));
        } else if (offHandItem.itemId === 'shield_wooden') {
          attacks.push(...WeaponAttackDatabase.getAttacksForWeapon('leather_shield'));
        }
      }
    }
    
    if (attacks.length === 0) {
      attacks.push({
        name: 'Unarmed Strike',
        actionCost: 1,
        staminaCost: 3,
        damageMultiplier: 0.5,
        hitBonus: 0,
        specialEffect: 'Basic unarmed attack',
        availableWithShield: true,
        requiresDualWield: false,
      });
    }
    
    return attacks;
  }

  private showAttackSelection(): void {
    const { width, height } = this.cameras.main;
    const player = this.gameState.getPlayer();
    const availableAttacks = EquipmentManager.getAvailableAttacks(player);
    
    this.isOverlayActive = true;
    this.attackUIElements = [];
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
    this.attackUIElements.push(overlay);
    
    const panelWidth = 600;
    const panelHeight = 400;
    const panel = this.add.rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x2a2a3e).setOrigin(0.5);
    this.attackUIElements.push(panel);
    
    const title = this.add.text(width / 2, height / 2 - panelHeight / 2 + 30, 'Select Attack', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5);
    this.attackUIElements.push(title);
    
    const cols = 2;
    const attackBoxWidth = 250;
    const attackBoxHeight = 90;
    const spacing = 20;
    const startX = width / 2 - (cols * attackBoxWidth + (cols - 1) * spacing) / 2;
    const startY = height / 2 - panelHeight / 2 + 80;
    
    availableAttacks.forEach((attack, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (attackBoxWidth + spacing);
      const y = startY + row * (attackBoxHeight + spacing);
      
      this.createAttackBox(x, y, attackBoxWidth, attackBoxHeight, attack, player.stamina);
    });
    
    const backBtn = this.createMenuButton(width / 2, height / 2 + panelHeight / 2 - 40, 'Back', () => {
      this.closeAttackSelection();
    });
    this.attackUIElements.push(backBtn);
  }

  private createAttackBox(x: number, y: number, width: number, height: number, attack: WeaponAttack, playerStamina: number): void {
    const state = this.combatSystem.getCombatState();
    const hasEnoughActions = state && state.actionsRemaining >= attack.actionCost;
    const canAffordStamina = playerStamina >= attack.staminaCost;
    const canUse = canAffordStamina && hasEnoughActions;
    
    const baseColor = canUse ? 0x444466 : 0x333344;
    const hoverColor = canUse ? 0x555577 : 0x444455;
    
    const bg = this.add.rectangle(x, y, width, height, baseColor).setOrigin(0);
    
    if (canUse) {
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(hoverColor))
        .on('pointerout', () => bg.setFillStyle(baseColor))
        .on('pointerdown', () => {
          this.selectAttack(attack);
        });
    } else {
      bg.setAlpha(0.5);
    }
    
    let nameColor = '#00ff00';
    if (!canAffordStamina) {
      nameColor = '#ff0000';
    } else if (!hasEnoughActions) {
      nameColor = '#888888';
    }
    
    const handLabel = attack.sourceHand === 'offHand' ? '[Off] ' : '[Main] ';
    const nameText = this.add.text(x + width / 2, y + 15, handLabel + attack.name, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: nameColor,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    
    const staminaText = this.add.text(x + 10, y + 45, `STAM ${attack.staminaCost}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: canAffordStamina ? '#ffcc00' : '#ff0000',
    });
    
    const actionText = this.add.text(x + width - 10, y + 45, `ATK ${attack.actionCost}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: hasEnoughActions ? '#ffffff' : '#888888',
    }).setOrigin(1, 0);
    
    if (attack.specialEffect) {
      const effectText = this.add.text(x + width / 2, y + 68, attack.specialEffect, {
        fontFamily: FONTS.primary,
        fontSize: '12px',
        color: canUse ? '#aaaaff' : '#666666',
        wordWrap: { width: width - 20 },
        align: 'center',
      }).setOrigin(0.5, 0);
      this.attackUIElements.push(effectText);
    }
    
    this.attackUIElements.push(bg, nameText, staminaText, actionText);
  }

  private selectAttack(attack: WeaponAttack): void {
    const state = this.combatSystem.getCombatState();
    if (!state || state.actionsRemaining < attack.actionCost) {
      this.showMessage('Not enough actions!');
      return;
    }
    
    this.selectedAttack = attack;
    this.closeAttackSelection();
    
    const isAoE = attack.name.includes('Arcing') || attack.name.includes('Spinning Flurry');
    
    if (isAoE) {
      this.executeAoEAttack();
    } else {
      this.showMessage('Select Target');
      this.isTargetSelectionMode = true;
      this.enableEnemyTargeting();
    }
  }

  private closeAttackSelection(): void {
    this.attackUIElements.forEach(el => el.destroy());
    this.attackUIElements = [];
    this.isOverlayActive = false;
  }

  private enableEnemyTargeting(): void {
    this.enemyContainers.forEach((container, index) => {
      const enemyVisual = container.getAt(0);
      const state = this.combatSystem.getCombatState();
      if (enemyVisual && state && state.enemies[index]?.health > 0) {
        if (enemyVisual instanceof Phaser.GameObjects.Sprite) {
          enemyVisual.setTint(0xffff00);
        } else if (enemyVisual instanceof Phaser.GameObjects.Rectangle) {
          enemyVisual.setStrokeStyle(3, 0xffff00);
        }
      }
    });
  }

  private disableEnemyTargeting(): void {
    this.enemyContainers.forEach((container) => {
      const enemyVisual = container.getAt(0);
      if (enemyVisual) {
        if (enemyVisual instanceof Phaser.GameObjects.Sprite) {
          enemyVisual.clearTint();
        } else if (enemyVisual instanceof Phaser.GameObjects.Rectangle) {
          enemyVisual.setStrokeStyle(0);
        }
      }
    });
  }

  private executeAoEAttack(): void {
    if (!this.selectedAttack) return;
    
    if (this.useServerCombat) {
      // For AoE attacks, target first living enemy (server handles hitting all)
      const state = this.combatSystem.getCombatState();
      if (!state) return;
      
      const firstLivingEnemy = state.enemies.find(e => e.health > 0);
      if (!firstLivingEnemy) return;
      
      this.executeServerAttack(state.enemies.indexOf(firstLivingEnemy), this.selectedAttack.name);
      this.selectedAttack = undefined;
    } else {
      const result = this.combatSystem.playerAttack(0, this.selectedAttack);
      this.selectedAttack = undefined;
      this.updateCombatDisplay();
      
      this.time.delayedCall(1000, () => {
        if (this.combatSystem.isCombatComplete()) {
          this.endCombat();
        } else {
          const state = this.combatSystem.getCombatState();
          if (state && state.currentTurn === 'enemy') {
            this.enemyTurn();
          }
        }
      });
    }
  }

  private renderStatusIndicators(enemy: Enemy, enemyIndex: number, enemyX: number, enemyY: number): void {
    const existingIndicators = this.statusIndicators.get(enemyIndex);
    if (existingIndicators) {
      existingIndicators.forEach(ind => ind.destroy());
    }
    
    const indicators: Phaser.GameObjects.Container[] = [];
    const iconSize = 24;
    const spacing = 5;
    let currentX = enemyX - (enemy.statusConditions.length * (iconSize + spacing)) / 2;
    const indicatorY = enemyY - 110;
    
    enemy.statusConditions.forEach((condition) => {
      let indicator: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
      
      if (condition.type === 'bleeding') {
        indicator = this.add.sprite(currentX, indicatorY, 'bleed-icon');
        indicator.setScale(0.5);
      } else if (condition.type === 'poisoned') {
        indicator = this.add.sprite(currentX, indicatorY, 'poison-icon');
        indicator.setScale(0.5);
      } else {
        const color = ConditionManager.getConditionColor(condition.type);
        indicator = this.add.rectangle(currentX, indicatorY, iconSize, iconSize, color);
      }
      
      const stackText = this.add.text(currentX, indicatorY, `${condition.stacks}`, {
        fontFamily: FONTS.primary,
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(1);
      
      const container = this.add.container(0, 0, [indicator, stackText]);
      indicators.push(container);
      
      currentX += iconSize + spacing;
    });
    
    this.statusIndicators.set(enemyIndex, indicators);
  }

  private updateStatusIndicators(): void {
    const state = this.combatSystem.getCombatState();
    if (!state) return;
    
    const { width } = this.cameras.main;
    const spacing = 200;
    const totalWidth = (state.enemies.length - 1) * spacing;
    const startX = width - 300 - totalWidth / 2;
    const startY = 200;
    
    state.enemies.forEach((enemy, index) => {
      const x = startX + (index * spacing);
      const y = startY;
      this.renderStatusIndicators(enemy, index, x, y);
    });
  }

  private showMessage(message: string): void {
    const msg = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY - 100, message, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffcc00',
      backgroundColor: '#000000',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: msg,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 1000,
      onComplete: () => msg.destroy(),
    });
  }
}
