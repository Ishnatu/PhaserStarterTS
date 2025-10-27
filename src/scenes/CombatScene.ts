import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { CombatSystem } from '../systems/CombatSystem';
import { Delve, DelveRoom, Enemy } from '../types/GameTypes';

export class CombatScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private combatSystem!: CombatSystem;
  private currentDelve!: Delve;
  private currentRoom!: DelveRoom;
  private logText!: Phaser.GameObjects.Text;
  private playerHealthText!: Phaser.GameObjects.Text;
  private enemyContainers: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('CombatScene');
  }

  init(data: { delve: Delve; room: DelveRoom }) {
    this.currentDelve = data.delve;
    this.currentRoom = data.room;
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('combat');
    this.combatSystem = new CombatSystem();

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x0f0f1f).setOrigin(0);

    this.add.text(width / 2, 30, this.currentRoom.type === 'boss' ? 'BOSS BATTLE!' : 'Combat', {
      fontSize: '28px',
      color: this.currentRoom.type === 'boss' ? '#ff0000' : '#ff8844',
    }).setOrigin(0.5);

    const enemies = this.generateEnemies();
    const player = this.gameState.getPlayer();
    
    this.combatSystem.initiateCombat(player, enemies);

    this.renderPlayer();
    this.renderEnemies(enemies);
    this.renderCombatLog();
    this.renderActionButtons();
  }

  private generateEnemies(): Enemy[] {
    const tier = this.currentDelve.tier;
    const isBoss = this.currentRoom.type === 'boss';
    
    if (isBoss) {
      return [{
        id: 'boss_1',
        name: `Void Beast Tier ${tier}`,
        health: 100 * tier,
        maxHealth: 100 * tier,
        attack: 15 * tier,
        defense: 10 * tier,
        speed: 5,
        lootTable: [],
      }];
    }

    const numEnemies = Math.floor(Math.random() * 2) + 1;
    const enemies: Enemy[] = [];

    for (let i = 0; i < numEnemies; i++) {
      enemies.push({
        id: `enemy_${i}`,
        name: `Void Spawn Tier ${tier}`,
        health: 50 * tier,
        maxHealth: 50 * tier,
        attack: 10 * tier,
        defense: 5 * tier,
        speed: 8,
        lootTable: [],
      });
    }

    return enemies;
  }

  private renderPlayer(): void {
    const { width, height } = this.cameras.main;
    const playerX = 150;
    const playerY = height - 200;

    const playerBox = this.add.rectangle(playerX, playerY, 80, 80, 0x4488ff);
    this.add.text(playerX, playerY - 100, 'YOU', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const player = this.gameState.getPlayer();
    this.playerHealthText = this.add.text(playerX, playerY + 60, 
      `HP: ${player.health}/${player.maxHealth}`, {
      fontSize: '12px',
      color: '#00ff00',
    }).setOrigin(0.5);
  }

  private renderEnemies(enemies: Enemy[]): void {
    const { width, height } = this.cameras.main;
    const startX = width - 200;
    const startY = height - 300;
    const spacing = 100;

    enemies.forEach((enemy, index) => {
      const x = startX;
      const y = startY + (index * spacing);

      const enemyBox = this.add.rectangle(x, y, 60, 60, 0xff4444);
      const nameText = this.add.text(x, y - 50, enemy.name, {
        fontSize: '12px',
        color: '#ffffff',
      }).setOrigin(0.5);

      const healthText = this.add.text(x, y + 40, 
        `HP: ${enemy.health}/${enemy.maxHealth}`, {
        fontSize: '11px',
        color: '#ff8888',
      }).setOrigin(0.5);

      const container = this.add.container(0, 0, [enemyBox, nameText, healthText]);
      container.setData('index', index);
      container.setData('healthText', healthText);
      this.enemyContainers.push(container);

      enemyBox.setInteractive({ useHandCursor: true })
        .on('pointerover', () => enemyBox.setFillStyle(0xff6666))
        .on('pointerout', () => enemyBox.setFillStyle(0xff4444))
        .on('pointerdown', () => this.attackEnemy(index));
    });
  }

  private renderCombatLog(): void {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, 500, 150, 0x1a1a2e, 0.8).setOrigin(0.5);
    
    this.logText = this.add.text(width / 2, height / 2, 'Combat begins!', {
      fontSize: '13px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 450 },
    }).setOrigin(0.5);
  }

  private renderActionButtons(): void {
    const { width, height } = this.cameras.main;
  }

  private attackEnemy(targetIndex: number): void {
    if (!this.combatSystem.isPlayerTurn()) return;

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

    state.enemies.forEach((enemy, index) => {
      const container = this.enemyContainers[index];
      if (container) {
        const healthText = container.getData('healthText') as Phaser.GameObjects.Text;
        healthText.setText(`HP: ${enemy.health}/${enemy.maxHealth}`);
        
        if (enemy.health <= 0) {
          container.setAlpha(0.3);
        }
      }
    });

    const recentLogs = state.combatLog.slice(-3).join('\n');
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
      
      const aaReward = 30 * this.currentDelve.tier;
      const caReward = 0.3 * this.currentDelve.tier;
      
      this.gameState.addArcaneAsh(aaReward);
      this.gameState.addCrystallineAnimus(caReward);
      
      this.showVictoryScreen(aaReward, caReward);
    } else {
      this.showDefeatScreen();
    }
  }

  private showVictoryScreen(aa: number, ca: number): void {
    const { width, height } = this.cameras.main;
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
    
    this.add.text(width / 2, height / 2 - 60, 'VICTORY!', {
      fontSize: '36px',
      color: '#00ff00',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, `Rewards:\n+${aa} AA\n+${ca.toFixed(1)} CA`, {
      fontSize: '18px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);

    this.createButton(width / 2, height / 2 + 80, 'Continue', () => {
      SceneManager.getInstance().transitionTo('delve', { delve: this.currentDelve });
    });
  }

  private showDefeatScreen(): void {
    const { width, height } = this.cameras.main;
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    
    this.add.text(width / 2, height / 2 - 40, 'DEFEATED', {
      fontSize: '36px',
      color: '#ff0000',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, 'Your soul returns to Roboka...', {
      fontSize: '16px',
      color: '#cccccc',
    }).setOrigin(0.5);

    this.createButton(width / 2, height / 2 + 80, 'Return to Town', () => {
      const player = this.gameState.getPlayer();
      this.gameState.updatePlayer({ 
        health: player.maxHealth,
        stamina: player.maxStamina,
      });
      SceneManager.getInstance().transitionTo('town');
    });
  }

  private createButton(
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
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5);

    return this.add.container(x, y, [bg, label]);
  }
}
