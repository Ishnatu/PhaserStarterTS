import Phaser from 'phaser';
import { SceneManager } from '../systems/SceneManager';
import { GameStateManager } from '../systems/GameStateManager';
import { ApiClient } from '../utils/ApiClient';

export class MainMenuScene extends Phaser.Scene {
  private statusText?: Phaser.GameObjects.Text;

  constructor() {
    super('MainMenuScene');
  }

  preload() {
    this.load.image('gemforge-logo', '/assets/ui/gemforge-logo.png');
  }

  async create() {
    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    const logo = this.add.sprite(width / 2, height / 3 - 50, 'gemforge-logo');
    logo.setOrigin(0.5);
    logo.setScale(0.6);

    this.add.text(width / 2, height / 3 + 150, 'Phase One: The Hunt', {
      fontSize: '24px',
      color: '#cccccc',
    }).setOrigin(0.5);

    this.statusText = this.add.text(width / 2, height / 2 - 20, 'Persistent saves enabled', {
      fontSize: '14px',
      color: '#00ff00',
    }).setOrigin(0.5);

    this.createButton(width / 2, height / 2 + 40, 'Start Game', async () => {
      if (this.statusText) {
        this.statusText.setText('Loading your save...');
      }
      
      const saveData = await ApiClient.loadGame();
      const gameState = GameStateManager.getInstance();
      
      if (saveData) {
        gameState.loadFromObject(saveData);
      } else {
        gameState.loadFromLocalStorage();
      }
      
      gameState.enableAutoSave(30);
      SceneManager.getInstance().transitionTo('town');
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
