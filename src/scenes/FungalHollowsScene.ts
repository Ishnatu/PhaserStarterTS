import Phaser from 'phaser';
import { SceneManager } from '../systems/SceneManager';
import { FONTS } from '../config/fonts';

export class FungalHollowsScene extends Phaser.Scene {
  constructor() {
    super('FungalHollowsScene');
  }

  create() {
    const { width, height } = this.cameras.main;
    
    this.cameras.main.setBackgroundColor(0x1a2a1a);
    
    const swampColors = [0x2d4a2d, 0x3d5a3d, 0x1d3a1d, 0x4d6a4d];
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = 20 + Math.random() * 60;
      const color = swampColors[Math.floor(Math.random() * swampColors.length)];
      const alpha = 0.3 + Math.random() * 0.4;
      this.add.circle(x, y, size, color, alpha);
    }

    const spotsColors = [0x88aa88, 0x669966, 0x557755];
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = 5 + Math.random() * 15;
      const color = spotsColors[Math.floor(Math.random() * spotsColors.length)];
      this.add.circle(x, y, size, color, 0.6);
    }

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    
    const titleText = this.add.text(width / 2, height / 3, 'FUNGAL HOLLOWS', {
      fontFamily: FONTS.primary,
      fontSize: '32px',
      color: '#66ff66',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    const subtitleText = this.add.text(width / 2, height / 3 + 50, 'Tier 2 Zone', {
      fontFamily: FONTS.primary,
      fontSize: '18px',
      color: '#44cc44',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    const comingSoonText = this.add.text(width / 2, height / 2, 'Coming Soon...', {
      fontFamily: FONTS.primary,
      fontSize: '24px',
      color: '#ffcc66',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: comingSoonText,
      alpha: 0.4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    const descText = this.add.text(width / 2, height / 2 + 60, [
      'The corrupted swamps await...',
      'Spores drift through murky air.',
      'Ancient roots writhe beneath the bog.',
    ].join('\n'), {
      fontFamily: FONTS.primary,
      fontSize: '12px',
      color: '#88aa88',
      align: 'center',
      lineSpacing: 8,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    const returnButton = this.add.text(width / 2, height - 100, '[ Return to Wilderness ]', {
      fontFamily: FONTS.primary,
      fontSize: '14px',
      color: '#aaaaaa',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    returnButton.setInteractive({ useHandCursor: true });
    returnButton.on('pointerover', () => {
      returnButton.setColor('#ffffff');
    });
    returnButton.on('pointerout', () => {
      returnButton.setColor('#aaaaaa');
    });
    returnButton.on('pointerdown', () => {
      SceneManager.getInstance().transitionTo('explore');
    });
  }
}
