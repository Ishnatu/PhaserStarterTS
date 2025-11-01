import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyFactory } from '../systems/EnemyFactory';
import { ItemDatabase } from '../config/ItemDatabase';
import { DiceRoller } from '../utils/DiceRoller';
import { Delve, DelveRoom, Enemy } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';
import { DurabilityManager } from '../systems/DurabilityManager';
import { FONTS } from '../config/fonts';
import { ItemColorUtil } from '../utils/ItemColorUtil';

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

  constructor() {
    super('CombatScene');
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

    const playerBox = this.add.rectangle(playerX, playerY, 100, 100, 0x4488ff);
    
    const player = this.gameState.getPlayer();
    
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
          if (!this.isOverlayActive) {
            this.attackEnemy(index);
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
    const menuY = height - 180;

    const menuBg = this.add.rectangle(menuX, menuY, 230, 160, 0x2a2a3e, 0.95).setOrigin(0);

    const attackBtn = this.createActionButton(menuX + 20, menuY + 20, 'Attack', () => {
      this.showMessage('Select an enemy to attack');
    });
    this.actionButtons.push(attackBtn);

    const inventoryBtn = this.createActionButton(menuX + 20, menuY + 70, 'Inventory', () => {
      this.openInventory();
    });
    this.actionButtons.push(inventoryBtn);

    const runBtn = this.createActionButton(menuX + 20, menuY + 120, 'Run', () => {
      this.attemptRun();
    });
    this.actionButtons.push(runBtn);
  }

  private createActionButton(
    x: number,
    y: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 190, 35, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', () => {
        if (!this.isOverlayActive && this.combatSystem.isPlayerTurn()) {
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
    this.updateCombatDisplay();

    this.time.delayedCall(1000, () => {
      if (!this.combatSystem.isCombatComplete()) {
        this.enemyTurn();
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
          SceneManager.getInstance().transitionTo('explore');
        } else {
          SceneManager.getInstance().transitionTo('delve', { delve: this.currentDelve });
        }
      });
    } else {
      this.showMessage('Failed to escape!');
      this.time.delayedCall(1500, () => {
        this.enemyTurn();
      });
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

  private executeAttack(targetIndex: number): void {
    const result = this.combatSystem.playerAttack(targetIndex);
    this.updateCombatDisplay();

    this.time.delayedCall(1000, () => {
      if (!this.combatSystem.isCombatComplete()) {
        this.enemyTurn();
      } else {
        this.endCombat();
      }
    });
  }

  private enemyTurn(): void {
    const logs = this.combatSystem.enemyTurn();
    this.updateCombatDisplay();

    if (this.combatSystem.isCombatComplete()) {
      this.time.delayedCall(1000, () => this.endCombat());
    }
  }

  private updateCombatDisplay(): void {
    const state = this.combatSystem.getCombatState();
    if (!state) return;

    this.playerHealthText.setText(`HP: ${state.player.health}/${state.player.maxHealth}`);
    this.playerStaminaText.setText(`SP: ${state.player.stamina}/${state.player.maxStamina}`);

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
        SceneManager.getInstance().transitionTo('delve', { delve: this.currentDelve });
      }
    });
  }

  private showDefeatScreen(): void {
    const { width, height } = this.cameras.main;
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    
    this.add.text(width / 2, height / 2 - 40, 'DEFEATED', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: '#ff0000',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, 'Your soul returns to Roboka...', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#cccccc',
    }).setOrigin(0.5);

    this.createMenuButton(width / 2, height / 2 + 80, 'Return to Town', () => {
      const player = this.gameState.getPlayer();
      this.gameState.updatePlayer({ 
        health: player.maxHealth,
        stamina: player.maxStamina,
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
