import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';

export class TownScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private infoText!: Phaser.GameObjects.Text;

  constructor() {
    super('TownScene');
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('town');

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x2a2a3e).setOrigin(0);

    this.add.text(width / 2, 60, 'ROBOKA - City of Steel', {
      fontSize: '32px',
      color: '#f0a020',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 120, 'The Last Bastion of Humanity', {
      fontSize: '16px',
      color: '#cccccc',
    }).setOrigin(0.5);

    const player = this.gameState.getPlayer();
    
    this.infoText = this.add.text(20, 180, this.getPlayerInfo(), {
      fontSize: '14px',
      color: '#ffffff',
      lineSpacing: 8,
    });

    const exploreBtn = this.createButton(width / 2, 320, 'Venture Into the Wilds', () => {
      SceneManager.getInstance().transitionTo('explore');
    });

    const saveBtn = this.createButton(width / 2, 380, 'Save Progress', () => {
      this.gameState.saveToLocalStorage();
      this.showMessage('Game saved!');
    });

    const resetBtn = this.createButton(width / 2, 440, 'Reset Game', () => {
      if (confirm('Are you sure? All progress will be lost!')) {
        this.gameState.resetGame();
        this.scene.restart();
      }
    });

    this.add.text(width / 2, height - 40, 'Gemforge Chronicles - Phase One: The Hunt', {
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5);
  }

  private getPlayerInfo(): string {
    const player = this.gameState.getPlayer();
    return [
      `Health: ${player.health} / ${player.maxHealth}`,
      `Stamina: ${player.stamina} / ${player.maxStamina}`,
      `Level: ${player.level}`,
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
}
