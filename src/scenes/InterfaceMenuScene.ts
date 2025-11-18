import Phaser from 'phaser';
import { AudioManager } from '../managers/AudioManager';
import { FONTS } from '../config/fonts';

export class InterfaceMenuScene extends Phaser.Scene {
  private escKey?: Phaser.Input.Keyboard.Key;
  private uiElements: Phaser.GameObjects.GameObject[] = [];
  private parentKey: string = '';
  private escMenuPaused: boolean = false;
  private currentTab: 'music' | 'controls' = 'music';
  private tabContent: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'InterfaceMenuScene' });
  }

  init(data: { parentKey: string; escMenuPaused?: boolean }) {
    this.parentKey = data.parentKey;
    this.escMenuPaused = data.escMenuPaused || false;
  }

  create() {
    const { width, height } = this.cameras.main;

    // Semi-transparent overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85)
      .setOrigin(0)
      .setDepth(10000);
    this.uiElements.push(overlay);

    // Settings panel
    const panel = this.add.rectangle(width / 2, height / 2, 700, 550, 0x2a2a3e)
      .setOrigin(0.5)
      .setDepth(10001);
    this.uiElements.push(panel);

    // Title
    const title = this.add.text(width / 2, height / 2 - 250, 'INTERFACE', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5).setDepth(10002);
    this.uiElements.push(title);

    // Tab buttons
    const musicTabButton = this.createTabButton(
      width / 2 - 120,
      height / 2 - 190,
      'Music',
      () => this.switchTab('music')
    );
    this.uiElements.push(...musicTabButton.elements);

    const controlsTabButton = this.createTabButton(
      width / 2 + 120,
      height / 2 - 190,
      'Controls',
      () => this.switchTab('controls')
    );
    this.uiElements.push(...controlsTabButton.elements);

    // Store tab buttons for highlighting
    this.uiElements.push({ musicTabBg: musicTabButton.bg, controlsTabBg: controlsTabButton.bg } as any);

    // Close Button
    const closeButton = this.createButton(
      width / 2,
      height / 2 + 240,
      'Close',
      () => this.closeMenu()
    );
    this.uiElements.push(...closeButton.elements);

    // ESC key to close
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => this.closeMenu());

    // Show initial tab
    this.switchTab('music');
  }

  private createTabButton(x: number, y: number, text: string, onClick: () => void): { elements: Phaser.GameObjects.GameObject[], bg: Phaser.GameObjects.Rectangle } {
    const elements: Phaser.GameObjects.GameObject[] = [];

    const bg = this.add.rectangle(x, y, 200, 50, 0x444466)
      .setDepth(10002)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        if (this.currentTab !== text.toLowerCase()) {
          bg.setFillStyle(0x555577);
        }
      })
      .on('pointerout', () => {
        if (this.currentTab !== text.toLowerCase()) {
          bg.setFillStyle(0x444466);
        }
      })
      .on('pointerdown', onClick);
    elements.push(bg);

    const label = this.add.text(x, y, text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10003);
    elements.push(label);

    return { elements, bg };
  }

  private switchTab(tab: 'music' | 'controls'): void {
    this.currentTab = tab;

    // Clear previous tab content
    this.tabContent.forEach(element => element.destroy());
    this.tabContent = [];

    // Update tab button colors
    const tabButtons = this.uiElements.find(el => 'musicTabBg' in el) as any;
    if (tabButtons) {
      tabButtons.musicTabBg.setFillStyle(tab === 'music' ? 0x666688 : 0x444466);
      tabButtons.controlsTabBg.setFillStyle(tab === 'controls' ? 0x666688 : 0x444466);
    }

    if (tab === 'music') {
      this.showMusicTab();
    } else {
      this.showControlsTab();
    }
  }

  private showMusicTab(): void {
    const { width, height } = this.cameras.main;
    const audioManager = AudioManager.getInstance();

    // Music Volume Label
    const musicLabel = this.add.text(width / 2 - 300, height / 2 - 100, 'Music Volume', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.tabContent.push(musicLabel);

    // Music Volume Slider
    const musicSlider = this.createSlider(
      width / 2,
      height / 2 - 60,
      audioManager.getMusicVolume(),
      (value) => {
        audioManager.setMusicVolume(value);
        musicValueText.setText(`${Math.round(value * 100)}%`);
      }
    );
    this.tabContent.push(...musicSlider.elements);

    const musicValueText = this.add.text(width / 2 + 180, height / 2 - 60, `${Math.round(audioManager.getMusicVolume() * 100)}%`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffff88',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.tabContent.push(musicValueText);

    // SFX Volume Label
    const sfxLabel = this.add.text(width / 2 - 300, height / 2 + 20, 'SFX Volume', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.tabContent.push(sfxLabel);

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
    this.tabContent.push(...sfxSlider.elements);

    const sfxValueText = this.add.text(width / 2 + 180, height / 2 + 60, `${Math.round(audioManager.getSfxVolume() * 100)}%`, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffff88',
    }).setOrigin(0, 0.5).setDepth(10002);
    this.tabContent.push(sfxValueText);

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
    this.tabContent.push(...muteButton.elements);
  }

  private showControlsTab(): void {
    const { width, height } = this.cameras.main;

    // Controls title
    const controlsTitle = this.add.text(width / 2, height / 2 - 130, 'Keybindings', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#f0a020',
    }).setOrigin(0.5).setDepth(10002);
    this.tabContent.push(controlsTitle);

    const keybindings = [
      { key: 'ESC', description: 'Open Menu / Close Interface' },
      { key: 'M', description: 'Game Menu (Wilderness/Delve)' },
      { key: 'Arrow Keys', description: 'Move Character (Wilderness)' },
      { key: 'Mouse Click', description: 'Interact / Select' },
    ];

    let yOffset = height / 2 - 80;
    keybindings.forEach(binding => {
      const keyText = this.add.text(width / 2 - 200, yOffset, binding.key, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#88ff88',
      }).setOrigin(0, 0.5).setDepth(10002);
      this.tabContent.push(keyText);

      const descText = this.add.text(width / 2 - 50, yOffset, binding.description, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
      }).setOrigin(0, 0.5).setDepth(10002);
      this.tabContent.push(descText);

      yOffset += 40;
    });
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
    // If ESC menu is paused, resume it; otherwise resume the game scene
    if (this.escMenuPaused) {
      this.scene.resume('EscMenuScene');
    } else if (this.parentKey) {
      this.scene.resume(this.parentKey);
    }
    this.scene.stop();
  }
}
