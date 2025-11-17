import Phaser from 'phaser';
import { AudioManager } from '../managers/AudioManager';
import { FONTS } from '../config/fonts';

export class SettingsMenuScene extends Phaser.Scene {
  private escKey?: Phaser.Input.Keyboard.Key;
  private uiElements: Phaser.GameObjects.GameObject[] = [];
  private parentKey: string = '';

  constructor() {
    super({ key: 'SettingsMenuScene' });
  }

  init(data: { parentKey: string }) {
    this.parentKey = data.parentKey;
  }

  create() {
    const { width, height } = this.cameras.main;
    const audioManager = AudioManager.getInstance();

    // Semi-transparent overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85)
      .setOrigin(0)
      .setDepth(10000);
    this.uiElements.push(overlay);

    // Settings panel
    const panel = this.add.rectangle(width / 2, height / 2, 600, 500, 0x2a2a3e)
      .setOrigin(0.5)
      .setDepth(10001);
    this.uiElements.push(panel);

    // Title
    const title = this.add.text(width / 2, height / 2 - 220, 'SETTINGS', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5).setDepth(10002);
    this.uiElements.push(title);

    // Music Volume Label
    const musicLabel = this.add.text(width / 2 - 250, height / 2 - 120, 'Music Volume', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.uiElements.push(musicLabel);

    // Music Volume Slider
    const musicSlider = this.createSlider(
      width / 2,
      height / 2 - 80,
      audioManager.getMusicVolume(),
      (value) => {
        audioManager.setMusicVolume(value);
        musicValueText.setText(`${Math.round(value * 100)}%`);
      }
    );
    this.uiElements.push(...musicSlider.elements);

    const musicValueText = this.add.text(width / 2 + 180, height / 2 - 80, `${Math.round(audioManager.getMusicVolume() * 100)}%`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffff88',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.uiElements.push(musicValueText);

    // SFX Volume Label
    const sfxLabel = this.add.text(width / 2 - 250, height / 2 + 20, 'SFX Volume', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.uiElements.push(sfxLabel);

    // SFX Volume Slider
    const sfxSlider = this.createSlider(
      width / 2,
      height / 2 + 60,
      audioManager.getSfxVolume(),
      (value) => {
        audioManager.setSfxVolume(value);
        sfxValueText.setText(`${Math.round(value * 100)}%`);
      }
    );
    this.uiElements.push(...sfxSlider.elements);

    const sfxValueText = this.add.text(width / 2 + 180, height / 2 + 60, `${Math.round(audioManager.getSfxVolume() * 100)}%`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffff88',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.uiElements.push(sfxValueText);

    // Mute Toggle Button
    const muteButton = this.createButton(
      width / 2,
      height / 2 + 140,
      audioManager.isMuted() ? 'Unmute' : 'Mute',
      () => {
        audioManager.toggleMute();
        muteButton.label.setText(audioManager.isMuted() ? 'Unmute' : 'Mute');
      }
    );
    this.uiElements.push(...muteButton.elements);

    // Close Button
    const closeButton = this.createButton(
      width / 2,
      height / 2 + 210,
      'Close',
      () => this.closeMenu()
    );
    this.uiElements.push(...closeButton.elements);

    // ESC key to close
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => this.closeMenu());
  }

  private createSlider(x: number, y: number, initialValue: number, onChange: (value: number) => void): { elements: Phaser.GameObjects.GameObject[] } {
    const elements: Phaser.GameObjects.GameObject[] = [];
    const sliderWidth = 300;

    // Slider track
    const track = this.add.rectangle(x, y, sliderWidth, 8, 0x444466)
      .setDepth(10002);
    elements.push(track);

    // Slider fill
    const fill = this.add.rectangle(x - sliderWidth / 2, y, sliderWidth * initialValue, 8, 0x88ff88)
      .setOrigin(0, 0.5)
      .setDepth(10003);
    elements.push(fill);

    // Slider handle
    const handle = this.add.circle(x - sliderWidth / 2 + sliderWidth * initialValue, y, 12, 0xffffff)
      .setInteractive({ useHandCursor: true, draggable: true })
      .setDepth(10004);
    elements.push(handle);

    // Drag handler
    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number) => {
      if (gameObject === handle) {
        const minX = x - sliderWidth / 2;
        const maxX = x + sliderWidth / 2;
        const clampedX = Phaser.Math.Clamp(dragX, minX, maxX);
        handle.setX(clampedX);
        
        const value = (clampedX - minX) / sliderWidth;
        fill.setDisplaySize(sliderWidth * value, 8);
        onChange(value);
      }
    });

    return { elements };
  }

  private createButton(x: number, y: number, text: string, onClick: () => void): { elements: Phaser.GameObjects.GameObject[], label: Phaser.GameObjects.Text } {
    const elements: Phaser.GameObjects.GameObject[] = [];

    const bg = this.add.rectangle(x, y, 250, 50, 0x444466)
      .setDepth(10002)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', onClick);
    elements.push(bg);

    const label = this.add.text(x, y, text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10003);
    elements.push(label);

    return { elements, label };
  }

  private closeMenu(): void {
    // Resume the parent scene that launched the settings menu
    if (this.parentKey) {
      this.scene.resume(this.parentKey);
    }
    this.scene.stop();
  }
}
