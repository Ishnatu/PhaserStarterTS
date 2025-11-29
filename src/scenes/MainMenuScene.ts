import Phaser from 'phaser';
import { SceneManager } from '../systems/SceneManager';
import { GameStateManager } from '../systems/GameStateManager';
import { ApiClient } from '../utils/ApiClient';
import { FONTS } from '../config/fonts';
import { AudioManager } from '../managers/AudioManager';

export class MainMenuScene extends Phaser.Scene {
  private escKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MainMenuScene');
  }

  preload() {
    this.load.image('gemforge-logo', '/assets/ui/gemforge-logo.png');
    this.load.image('start-button', '/assets/ui/start-button.png');
    this.load.audio('intro-music', '/assets/audio/intro-music.mp3');
    
    // Preload all NPC icons for TownScene
    this.load.image('blacksmith-button', '/assets/ui/shop-buttons/blacksmith-button.png');
    this.load.image('garthek-button', '/assets/ui/shop-buttons/garthek-button.png');
    this.load.image('merchant-icon', '/assets/npcs/merchant-icon.png');
    this.load.image('innkeeper-icon', '/assets/npcs/innkeeper-icon.png');
    this.load.image('gem-expert-icon', '/assets/npcs/gem-expert-icon.png');
    this.load.image('marketplace-icon', '/assets/npcs/marketplace-icon.png');
    this.load.image('vault-keeper-icon', '/assets/npcs/vault-keeper-icon.png');
    this.load.image('keeper-of-virtue-icon', '/assets/npcs/keeper-of-virtue-icon.png');
    this.load.image('mage-tower-icon', '/assets/npcs/mage-tower-icon.png');
  }

  async create() {
    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    const logo = this.add.sprite(width / 2, 200, 'gemforge-logo');
    logo.setOrigin(0.5);
    logo.setScale(0.18);

    this.add.text(width / 2, 400, 'PHASE ONE: THE HUNT', {
      fontSize: FONTS.size.large,
      color: '#f0a020',
      fontFamily: FONTS.primary,
    }).setOrigin(0.5);

    // Display authenticated user info (cached from bootstrap)
    const user = (window as any).authenticatedUser;
    if (user) {
      this.add.text(width - 20, 20, `Player: ${user.username}`, {
        fontSize: FONTS.size.small,
        color: '#88ff88',
        fontFamily: FONTS.primary,
        resolution: 2,
      }).setOrigin(1, 0);

      // Add logout button
      const logoutBtn = this.add.text(width - 20, 60, '[Logout]', {
        fontSize: FONTS.size.xsmall,
        color: '#ff8888',
        fontFamily: FONTS.primary,
        resolution: 2,
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

      logoutBtn.on('pointerover', () => logoutBtn.setColor('#ffaaaa'));
      logoutBtn.on('pointerout', () => logoutBtn.setColor('#ff8888'));
      logoutBtn.on('pointerdown', async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/';
      });
    }

    const startButton = this.add.sprite(width / 2, height / 2 + 150, 'start-button');
    startButton.setOrigin(0.5);
    startButton.setScale(0.4);
    startButton.setInteractive({ useHandCursor: true });
    
    startButton.on('pointerover', () => {
      startButton.setTint(0xdddddd);
    });
    
    startButton.on('pointerout', () => {
      startButton.clearTint();
    });
    
    startButton.on('pointerdown', async () => {
      // Stop intro music before transitioning
      const audioManager = AudioManager.getInstance();
      audioManager.stopMusic(true);
      
      const saveData = await ApiClient.loadGame();
      const gameState = GameStateManager.getInstance();
      
      let isNewGame = true;
      if (saveData) {
        // Load existing save from server
        gameState.loadFromObject(saveData);
        isNewGame = false;
      }
      // If no save data, GameStateManager already has initial state
      
      // Mark game as initialized so scene transitions can save
      gameState.markInitialized();
      gameState.enableAutoSave(30);
      
      // Fresh expedition for new games, preserve state for loaded saves
      SceneManager.getInstance().transitionTo('town', { freshExpedition: isNewGame });
    });

    this.add.text(width / 2, height - 40, '© 2025 - A Dark Fantasy Extraction RPG', {
      fontSize: FONTS.size.small,
      color: '#666666',
      fontFamily: FONTS.primary,
    }).setOrigin(0.5);

    // Start playing intro music with fade in
    const audioManager = AudioManager.getInstance();
    audioManager.playMusic(this, 'intro-music', true);

    // ESC key for menu
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => {
      this.scene.launch('EscMenuScene', { parentKey: this.scene.key });
      this.scene.pause();
    });
  }

}
