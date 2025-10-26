import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    this.load.image('player', 'src/assets/player.png');
  }
  create() {
    this.scene.start('Play');
  }
}
