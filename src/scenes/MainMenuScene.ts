import Phaser from 'phaser';
import { SceneManager } from '../systems/SceneManager';
import { GameStateManager } from '../systems/GameStateManager';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create() {
    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    this.add.text(width / 2, height / 3, 'Gemforge Chronicles', {
      fontSize: '48px',
      color: '#f0a020',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 3 + 60, 'Phase One: The Hunt', {
      fontSize: '20px',
      color: '#cccccc',
    }).setOrigin(0.5);

    const startBtn = this.createButton(width / 2, height / 2 + 40, 'Start Game', () => {
      GameStateManager.getInstance().loadFromLocalStorage();
      SceneManager.getInstance().transitionTo('town');
    });

    const exitBtn = this.createButton(width / 2, height / 2 + 120, 'Exit Game', () => {
      if (confirm('Exit Gemforge Chronicles?')) {
        window.close();
      }
    });

    this.add.text(width / 2, height - 40, '© 2025 - A Dark Fantasy Extraction RPG', {
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5);
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
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    return container;
  }
}
