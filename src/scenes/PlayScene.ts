import Phaser from 'phaser';

export class PlayScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() { super('Play'); }

  create() {
    const centerX = this.cameras.main.centerX;
    const centerY = this.cameras.main.centerY;

    // Add a simple checker background
    const g = this.add.graphics();
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 27; x++) {
        g.fillStyle(((x + y) % 2 === 0) ? 0x21303a : 0x18242d, 1);
        g.fillRect(x * 30, y * 30, 30, 30);
      }
    }

    this.player = this.physics.add.image(centerX, centerY, 'player');
    this.player.setScale(3); // scale 32x48 sprite
    this.player.setCollideWorldBounds(true);

    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update() {
    const speed = 160;
    let vx = 0, vy = 0;
    if (this.cursors.left?.isDown) vx -= speed;
    if (this.cursors.right?.isDown) vx += speed;
    if (this.cursors.up?.isDown) vy -= speed;
    if (this.cursors.down?.isDown) vy += speed;
    this.player.setVelocity(vx, vy);
  }
}
