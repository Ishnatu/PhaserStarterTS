import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { DelveGenerator } from '../systems/DelveGenerator';
import { GameConfig } from '../config/GameConfig';

export class ExploreScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private delveMarkers: Phaser.GameObjects.Container[] = [];
  private infoText!: Phaser.GameObjects.Text;

  constructor() {
    super('ExploreScene');
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('explore');

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x1a4a2a).setOrigin(0);

    this.add.text(width / 2, 20, 'The Wilds of Grawgonia', {
      fontSize: '24px',
      color: '#90ee90',
    }).setOrigin(0.5);

    const playerData = this.gameState.getPlayer();
    this.player = this.add.rectangle(width / 2, height / 2, 32, 32, 0x4488ff);

    this.generateDelves();

    this.cursors = this.input.keyboard!.createCursorKeys();

    const returnBtn = this.createButton(width - 120, 20, 'Return to Town', () => {
      SceneManager.getInstance().transitionTo('town');
    });

    this.infoText = this.add.text(20, 60, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 10, y: 5 },
    });

    this.add.text(20, height - 40, 'Arrow keys to move • Approach delves to enter', {
      fontSize: '12px',
      color: '#cccccc',
    });
  }

  update() {
    const speed = 3;
    let moved = false;

    if (this.cursors.left.isDown) {
      this.player.x -= speed;
      moved = true;
    }
    if (this.cursors.right.isDown) {
      this.player.x += speed;
      moved = true;
    }
    if (this.cursors.up.isDown) {
      this.player.y -= speed;
      moved = true;
    }
    if (this.cursors.down.isDown) {
      this.player.y += speed;
      moved = true;
    }

    if (moved) {
      this.checkRandomEncounter();
      this.checkDelveProximity();
    }

    this.updateInfo();
  }

  private generateDelves(): void {
    const { width, height } = this.cameras.main;
    
    for (let i = 0; i < 3; i++) {
      const x = 100 + Math.random() * (width - 200);
      const y = 100 + Math.random() * (height - 200);
      const tier = 1;

      const marker = this.createDelveMarker(x, y, tier);
      this.delveMarkers.push(marker);
    }
  }

  private createDelveMarker(x: number, y: number, tier: number): Phaser.GameObjects.Container {
    const icon = this.add.rectangle(0, 0, 24, 24, 0x8b0000);
    const glow = this.add.circle(0, 0, 16, 0xff0000, 0.3);
    const label = this.add.text(0, -30, `Delve T${tier}`, {
      fontSize: '12px',
      color: '#ff6666',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: glow,
      scale: 1.3,
      alpha: 0.1,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });

    const container = this.add.container(x, y, [glow, icon, label]);
    container.setData('tier', tier);
    
    return container;
  }

  private checkDelveProximity(): void {
    for (const marker of this.delveMarkers) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        marker.x,
        marker.y
      );

      if (distance < 40) {
        this.enterDelve(marker.getData('tier'));
      }
    }
  }

  private enterDelve(tier: number): void {
    const generator = new DelveGenerator();
    const delve = generator.generateDelve(tier);
    
    SceneManager.getInstance().transitionTo('delve', { delve });
  }

  private checkRandomEncounter(): void {
    if (Math.random() < GameConfig.WORLD.RANDOM_ENCOUNTER_CHANCE / 100) {
    }
  }

  private updateInfo(): void {
    const player = this.gameState.getPlayer();
    this.infoText.setText([
      `HP: ${player.health}/${player.maxHealth}`,
      `AA: ${player.arcaneAsh} | CA: ${player.crystallineAnimus.toFixed(1)}`,
    ].join('\n'));
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 140, 30, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', callback);

    const label = this.add.text(0, 0, text, {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5);

    return this.add.container(x, y, [bg, label]);
  }
}
