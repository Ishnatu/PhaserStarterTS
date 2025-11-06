import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyFactory } from '../systems/EnemyFactory';
import { ItemDatabase } from '../config/ItemDatabase';
import { DiceRoller } from '../utils/DiceRoller';
import { Delve, DelveRoom, Enemy, PlayerEquipment, InventoryItem, WeaponAttack } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';
import { DurabilityManager } from '../systems/DurabilityManager';
import { FONTS } from '../config/fonts';
import { ItemColorUtil } from '../utils/ItemColorUtil';
import { ApiClient } from '../utils/ApiClient';
import { WeaponAttackDatabase } from '../config/WeaponAttackDatabase';
import { ConditionManager } from '../systems/ConditionManager';
import { EquipmentManager } from '../systems/EquipmentManager';

export class CombatScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private combatSystem!: CombatSystem;
  private currentDelve!: Delve;
  private currentRoom!: DelveRoom;
  private logText!: Phaser.GameObjects.Text;
  private playerHealthText!: Phaser.GameObjects.Text;
  private playerStaminaText!: Phaser.GameObjects.Text;
  private enemyContainers: Phaser.GameObjects.Container[] = [];
  private enemyHealthTexts: Phaser.GameObjects.Text[] = [];
  private isWildEncounter: boolean = false;
  private wildEnemies?: Enemy[];
  private isOverlayActive: boolean = false;
  private actionButtons: Phaser.GameObjects.Container[] = [];
  private returnToLocation?: { x: number; y: number };
  private selectedAttack?: WeaponAttack;
  private attackUIElements: Phaser.GameObjects.GameObject[] = [];
  private statusIndicators: Map<number, Phaser.GameObjects.Container[]> = new Map();
  private isTargetSelectionMode: boolean = false;
  private actionCounterText!: Phaser.GameObjects.Text;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private previousPlayerHealth: number = 0;

  constructor() {
    super('CombatScene');
  }

  preload() {
    this.load.image('player-combat', '/assets/player/player-combat.png');
    this.load.image('void-spawn', '/assets/enemies/void-spawn.png');
    this.load.image('greater-void-spawn', '/assets/enemies/greater-void-spawn.png');
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

    this.enemyContainers = [];
    this.enemyHealthTexts = [];
    this.actionButtons = [];
    this.isOverlayActive = false;

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x0f0f1f).setOrigin(0);

    const titleText = this.add.text(width / 2, height / 2, this.currentRoom.type === 'boss' ? 'BOSS BATTLE!' : 'Combat Begins!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: this.currentRoom.type === 'boss' ? '#ff0000' : '#ff8844',
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

    const enemies = this.generateEnemies();
    const player = this.gameState.getPlayer();
    
    this.combatSystem.initiateCombat(player, enemies);

    this.renderPlayer();
    this.renderEnemies(enemies);
    this.renderCombatLog();
    this.renderActionButtons();
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
    const playerX = 240;
    const playerY = height - 200;

    this.playerSprite = this.add.sprite(playerX, playerY, 'player-combat');
    this.playerSprite.setScale(0.24);
    
    const player = this.gameState.getPlayer();
    this.previousPlayerHealth = player.health;
    
    // Nameplate below sprite - horizontal layout
    const plateY = playerY + 80;
    const playerInfoBg = this.add.rectangle(60, plateY, 440, 60, 0x2a2a3e, 0.9).setOrigin(0);
    
    this.add.text(80, plateY + 10, 'YOU', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      fontStyle: 'bold',
    });

    this.add.text(80, plateY + 35, `Lv ${player.level}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc00',
    });

    this.playerHealthText = this.add.text(200, plateY + 10, 
      `HP: ${player.health}/${player.maxHealth}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#00ff00',
    });

    this.playerStaminaText = this.add.text(200, plateY + 35, 
      `SP: ${player.stamina}/${player.maxStamina}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffcc00',
    });
  }

  private renderEnemies(enemies: Enemy[]): void {
    const { width, height } = this.cameras.main;
    const spacing = 200;
    const totalWidth = (enemies.length - 1) * spacing;
    const startX = width - 300 - totalWidth / 2;
    const startY = 200;

    enemies.forEach((enemy, index) => {
      const x = startX + (index * spacing);
      const y = startY;

      const enemyBox = this.add.rectangle(x, y, 80, 80, 0xff4444);
      
      // Nameplate positioned above sprite - centered
      const plateY = y - 80;
      const enemyInfoBg = this.add.rectangle(x - 90, plateY, 180, 60, 0x2a2a3e, 0.9).setOrigin(0);
      
      const nameText = this.add.text(x, plateY + 10, enemy.name, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);

      const healthText = this.add.text(x, plateY + 35, 
        `HP: ${enemy.health}/${enemy.maxHealth}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ff8888',
      }).setOrigin(0.5, 0);

      this.enemyHealthTexts.push(healthText);

      const container = this.add.container(0, 0, [enemyBox, enemyInfoBg, nameText, healthText]);
      container.setData('index', index);
      this.enemyContainers.push(container);

      enemyBox.setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          if (!this.isOverlayActive && this.combatSystem.isPlayerTurn()) {
            enemyBox.setFillStyle(0xff6666);
          }
        })
        .on('pointerout', () => enemyBox.setFillStyle(0xff4444))
        .on('pointerdown', () => {
          if (!this.isOverlayActive && this.isTargetSelectionMode) {
            this.attackEnemyWithSelectedAttack(index);
          }
        });
    });
  }

  private renderCombatLog(): void {
    const { width, height } = this.cameras.main;
    const logX = 20;
    const logY = height - 350;

    this.add.rectangle(logX, logY, 480, 120, 0x1a1a2e, 0.8).setOrigin(0);
    
    this.logText = this.add.text(logX + 10, logY + 10, 'Combat begins!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      align: 'left',
      wordWrap: { width: 460 },
    });
  }

  private renderActionButtons(): void {
    const { width, height } = this.cameras.main;
    const menuX = width - 250;
    const menuY = height - 230;

    const menuBg = this.add.rectangle(menuX, menuY, 230, 210, 0x2a2a3e, 0.95).setOrigin(0);

    const state = this.combatSystem.getCombatState();
    const actionsRemaining = state?.actionsRemaining || 0;
    const maxActions = state?.maxActionsPerTurn || 2;

    this.actionCounterText = this.add.text(menuX + 115, menuY + 15, `Actions: ${actionsRemaining}/${maxActions}`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#00ff00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const attackBtn = this.createActionButton(menuX + 20, menuY + 40, 'Attack', () => {
      this.showAttackSelection();
    });
    this.actionButtons.push(attackBtn);

    const inventoryBtn = this.createActionButton(menuX + 20, menuY + 90, 'Inventory', () => {
      this.openInventory();
    });
    this.actionButtons.push(inventoryBtn);

    const runBtn = this.createActionButton(menuX + 20, menuY + 140, 'Run', () => {
      this.attemptRun();
    });
    this.actionButtons.push(runBtn);

    const endTurnBtn = this.createActionButton(menuX + 20, menuY + 170, 'End Turn', () => {
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
        if (text === 'Attack' || text === 'Inventory') {
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
          if ((text === 'Attack' || text === 'Inventory') && !hasActions) {
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
    
    if (!potion) return;

    const restorationRoll = DiceRoller.rollDiceTotal(potion.restoration);
    const amount = restorationRoll.total;

    if (potion.type === 'health') {
      player.health = Math.min(player.maxHealth, player.health + amount);
      this.combatSystem.updatePlayerHealth(player.health);
      this.showMessage(`Used ${potion.name}! Restored ${amount} HP`);
    } else if (potion.type === 'stamina') {
      player.stamina = Math.min(player.maxStamina, player.stamina + amount);
      this.combatSystem.updatePlayerStamina(player.stamina);
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
    
    if (!potion) return;

    const restorationRoll = DiceRoller.rollDiceTotal(potion.restoration);
    const amount = restorationRoll.total;

    if (potion.type === 'health') {
      player.health = Math.min(player.maxHealth, player.health + amount);
      this.combatSystem.updatePlayerHealth(player.health);
    } else if (potion.type === 'stamina') {
      player.stamina = Math.min(player.maxStamina, player.stamina + amount);
      this.combatSystem.updatePlayerStamina(player.stamina);
    }

    this.gameState.removeItemFromInventory(itemId, 1);
    this.gameState.updatePlayer(player);
    this.updateCombatDisplay();
  }

  private attemptRun(): void {
    const runChance = Math.random();
    
    if (runChance > 0.5) {
      this.showMessage('Successfully escaped!');
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
      this.showMessage('Failed to escape!');
      this.time.delayedCall(1500, () => {
        this.enemyTurn();
      });
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
    });
  }

  private endPlayerTurn(): void {
    this.showMessage('Ending turn...');
    this.time.delayedCall(500, () => {
      this.enemyTurn();
    });
  }

  private enemyTurn(): void {
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
    }
  }

  private updateCombatDisplay(): void {
    const state = this.combatSystem.getCombatState();
    if (!state) return;

    this.playerHealthText.setText(`HP: ${state.player.health}/${state.player.maxHealth}`);
    this.playerStaminaText.setText(`SP: ${state.player.stamina}/${state.player.maxStamina}`);

    if (this.actionCounterText) {
      this.actionCounterText.setText(`Actions: ${state.actionsRemaining}/${state.maxActionsPerTurn}`);
    }

    if (state.player.health < this.previousPlayerHealth) {
      this.playHitFlashAnimation();
    }
    this.previousPlayerHealth = state.player.health;

    state.enemies.forEach((enemy, index) => {
      const healthText = this.enemyHealthTexts[index];
      const container = this.enemyContainers[index];
      
      if (healthText) {
        healthText.setText(`HP: ${enemy.health}/${enemy.maxHealth}`);
      }
      
      if (container && enemy.health <= 0) {
        container.setAlpha(0.3);
      }
    });

    const recentLogs = state.combatLog.slice(-4).join('\n');
    this.logText.setText(recentLogs);
    
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

  private endCombat(): void {
    const state = this.combatSystem.getCombatState();
    if (!state) return;

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
      
      const aaReward = 30 * this.currentDelve.tier;
      const caReward = 0.3 * this.currentDelve.tier;
      
      this.gameState.addArcaneAsh(aaReward);
      this.gameState.addCrystallineAnimus(caReward);
      
      const allLoot: string[] = [];
      state.enemies.forEach(enemy => {
        const loot = EnemyFactory.rollLoot(enemy);
        allLoot.push(...loot);
      });
      
      this.showVictoryScreen(aaReward, caReward, allLoot, durabilityMessages);
    } else {
      this.showDefeatScreen();
    }
  }

  private showVictoryScreen(aa: number, ca: number, loot: string[], durabilityMessages: string[]): void {
    const { width, height } = this.cameras.main;
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
    
    this.add.text(width / 2, height / 2 - 100, 'VICTORY!', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: '#00ff00',
    }).setOrigin(0.5);

    const baseRewardText = `Rewards:\n+${aa} AA\n+${ca.toFixed(1)} CA`;
    
    interface LootItemInfo {
      name: string;
      enhancementLevel?: number;
      isShiny?: boolean;
    }
    
    const itemsAdded: LootItemInfo[] = [];
    const itemsFailed: LootItemInfo[] = [];
    
    const player = this.gameState.getPlayer();
    
    for (const itemId of loot) {
      const item = ItemDatabase.getItem(itemId);
      if (item) {
        if (this.gameState.addItemToInventory(itemId, 1)) {
          const addedItem = player.inventory.find(invItem => invItem.itemId === itemId);
          itemsAdded.push({
            name: item.name,
            enhancementLevel: addedItem?.enhancementLevel,
            isShiny: addedItem?.isShiny
          });
        } else {
          itemsFailed.push({
            name: item.name,
            enhancementLevel: 0,
            isShiny: false
          });
        }
      }
    }
    
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
        SceneManager.getInstance().transitionTo('town');
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
      const deathLocation = this.returnToLocation || player.position || { x: 1500, y: 1500 };
      
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
      SceneManager.getInstance().transitionTo('town');
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
      const enemyBox = container.getAt(0) as Phaser.GameObjects.Rectangle;
      if (enemyBox && this.combatSystem.getCombatState()?.enemies[index].health > 0) {
        enemyBox.setStrokeStyle(3, 0xffff00);
      }
    });
  }

  private disableEnemyTargeting(): void {
    this.enemyContainers.forEach((container) => {
      const enemyBox = container.getAt(0) as Phaser.GameObjects.Rectangle;
      if (enemyBox) {
        enemyBox.setStrokeStyle(0);
      }
    });
  }

  private executeAoEAttack(): void {
    if (!this.selectedAttack) return;
    
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

  private renderStatusIndicators(enemy: Enemy, enemyIndex: number, enemyX: number, enemyY: number): void {
    const existingIndicators = this.statusIndicators.get(enemyIndex);
    if (existingIndicators) {
      existingIndicators.forEach(ind => ind.destroy());
    }
    
    const indicators: Phaser.GameObjects.Container[] = [];
    const squareSize = 20;
    const spacing = 5;
    let currentX = enemyX - (enemy.statusConditions.length * (squareSize + spacing)) / 2;
    const indicatorY = enemyY - 110;
    
    enemy.statusConditions.forEach((condition) => {
      const color = ConditionManager.getConditionColor(condition.type);
      const square = this.add.rectangle(currentX, indicatorY, squareSize, squareSize, color);
      
      const stackText = this.add.text(currentX, indicatorY, condition.stacks > 1 ? `${condition.stacks}` : '', {
        fontFamily: FONTS.primary,
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      
      const container = this.add.container(0, 0, [square, stackText]);
      indicators.push(container);
      
      currentX += squareSize + spacing;
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
