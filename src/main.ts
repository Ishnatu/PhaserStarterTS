import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PlayScene } from './scenes/PlayScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 800,
  height: 450,
  pixelArt: true,
  backgroundColor: '#1b1f24',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false }
  },
  scene: [BootScene, PlayScene]
};

new Phaser.Game(config);
