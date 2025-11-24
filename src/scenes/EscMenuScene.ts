import Phaser from 'phaser';
import { SceneManager } from '../systems/SceneManager';
import { FONTS } from '../config/fonts';

export class EscMenuScene extends Phaser.Scene {
  private escKey?: Phaser.Input.Keyboard.Key;
  private uiElements: Phaser.GameObjects.GameObject[] = [];
  private parentKey: string = '';

  constructor() {
    super({ key: 'EscMenuScene' });
  }

  init(data: { parentKey: string }) {
    this.parentKey = data.parentKey;
  }

  create() {
    const { width, height } = this.cameras.main;

    // Semi-transparent overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85)
      .setOrigin(0)
      .setDepth(10000);
    this.uiElements.push(overlay);

    // Menu panel
    const panel = this.add.rectangle(width / 2, height / 2, 400, 350, 0x2a2a3e)
      .setOrigin(0.5)
      .setDepth(10001);
    this.uiElements.push(panel);

    // Title
    const title = this.add.text(width / 2, height / 2 - 140, 'MENU', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#f0a020',
    }).setOrigin(0.5).setDepth(10002);
    this.uiElements.push(title);

    // Interface Button
    const interfaceButton = this.createButton(
      width / 2,
      height / 2 - 40,
      'Interface',
      () => {
        this.scene.pause();
        this.scene.launch('InterfaceMenuScene', { parentKey: this.parentKey, escMenuPaused: true });
      }
    );
    this.uiElements.push(...interfaceButton.elements);

    // Exit Game Button
    const exitButton = this.createButton(
      width / 2,
      height / 2 + 40,
      'Exit Game',
      () => this.showExitConfirmation()
    );
    this.uiElements.push(...exitButton.elements);

    // Close Button
    const closeButton = this.createButton(
      width / 2,
      height / 2 + 120,
      'Close',
      () => this.closeMenu()
    );
    this.uiElements.push(...closeButton.elements);

    // ESC key to close
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => this.closeMenu());
  }

  private showExitConfirmation(): void {
    const { width, height } = this.cameras.main;

    // Darker overlay for confirmation
    const confirmOverlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.5)
      .setOrigin(0)
      .setDepth(10005);
    this.uiElements.push(confirmOverlay);

    // Confirmation panel
    const confirmPanel = this.add.rectangle(width / 2, height / 2, 450, 250, 0x1a1a2e)
      .setOrigin(0.5)
      .setDepth(10006);
    this.uiElements.push(confirmPanel);

    // Confirmation text
    const confirmText = this.add.text(width / 2, height / 2 - 60, 'Exit to Main Menu?', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.large,
      color: '#ff8844',
    }).setOrigin(0.5).setDepth(10007);
    this.uiElements.push(confirmText);

    const warningText = this.add.text(width / 2, height / 2 - 20, 'Progress is auto-saved', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#88ff88',
    }).setOrigin(0.5).setDepth(10007);
    this.uiElements.push(warningText);

    // Yes button
    const yesButton = this.createButton(
      width / 2 - 100,
      height / 2 + 60,
      'Yes',
      () => {
        this.scene.stop();
        if (this.parentKey) {
          this.scene.stop(this.parentKey);
        }
        this.scene.start('MainMenuScene');
      }
    );
    this.uiElements.push(...yesButton.elements);

    // No button
    const noButton = this.createButton(
      width / 2 + 100,
      height / 2 + 60,
      'No',
      () => {
        // Remove confirmation UI elements
        const elementsToRemove = [confirmOverlay, confirmPanel, confirmText, warningText, ...yesButton.elements, ...noButton.elements];
        elementsToRemove.forEach(el => el.destroy());
        
        // Remove them from uiElements array
        elementsToRemove.forEach(el => {
          const index = this.uiElements.indexOf(el);
          if (index > -1) {
            this.uiElements.splice(index, 1);
          }
        });
      }
    );
    this.uiElements.push(...noButton.elements);
  }

  private createButton(x: number, y: number, text: string, onClick: () => void): { elements: Phaser.GameObjects.GameObject[] } {
    const elements: Phaser.GameObjects.GameObject[] = [];

    const bg = this.add.rectangle(x, y, 250, 50, 0x444466)
      .setDepth(10008)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', onClick);
    elements.push(bg);

    const label = this.add.text(x, y, text, {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10009);
    elements.push(label);

    return { elements };
  }

  private closeMenu(): void {
    // Resume the parent scene
    if (this.parentKey) {
      this.scene.resume(this.parentKey);
    }
    this.scene.stop();
  }
}
