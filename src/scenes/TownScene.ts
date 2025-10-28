import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';

export class TownScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private infoText!: Phaser.GameObjects.Text;

  constructor() {
    super('TownScene');
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('town');

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x2a2a3e).setOrigin(0);

    this.add.text(width / 2, 60, 'Gemforge Chronicles', {
      fontSize: '32px',
      color: '#f0a020',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 120, 'ROBOKA - City of Steel', {
      fontSize: '18px',
      color: '#cccccc',
    }).setOrigin(0.5);

    const player = this.gameState.getPlayer();
    
    this.infoText = this.add.text(20, 180, this.getPlayerInfo(), {
      fontSize: '14px',
      color: '#ffffff',
      lineSpacing: 8,
    });

    this.createNPCs();

    const exploreBtn = this.createButton(width / 2, height - 100, 'Venture Into the Wilds', () => {
      SceneManager.getInstance().transitionTo('explore');
    });

  }

  private createNPCs(): void {
    const { width } = this.cameras.main;
    const npcY = 240;
    const npcSpacing = 90;

    const npcs = [
      { name: 'Blacksmith', color: 0xff6633, description: 'Forges and upgrades equipment' },
      { name: 'Merchant', color: 0x66cc66, description: 'Buys and sells goods' },
      { name: 'Innkeeper', color: 0x6699ff, description: 'Provides rest and healing' },
      { name: 'Quest Giver', color: 0xffcc33, description: 'Offers missions and lore' },
      { name: 'Gem Expert', color: 0xcc66ff, description: 'Soulbinds Voidtouched Gems' },
      { name: 'Marketplace', color: 0xff9966, description: 'Player trading hub' },
    ];

    const columns = 3;
    const startX = width / 2 - (columns - 1) * npcSpacing;

    npcs.forEach((npc, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = startX + col * (npcSpacing * 2);
      const y = npcY + row * 100;

      const npcBox = this.add.rectangle(x, y, 80, 80, npc.color)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => npcBox.setFillStyle(npc.color, 0.7))
        .on('pointerout', () => npcBox.setFillStyle(npc.color, 1))
        .on('pointerdown', () => this.interactWithNPC(npc.name, npc.description));

      this.add.text(x, y + 50, npc.name, {
        fontSize: '12px',
        color: '#ffffff',
      }).setOrigin(0.5);
    });
  }

  private interactWithNPC(name: string, description: string): void {
    const msg = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      `${name}\n\n${description}\n\n[Coming Soon]`,
      {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 30, y: 20 },
        align: 'center',
      }
    ).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: msg,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 2000,
      onComplete: () => msg.destroy(),
    });
  }

  private getPlayerInfo(): string {
    const player = this.gameState.getPlayer();
    return [
      `Health: ${player.health} / ${player.maxHealth}`,
      `Stamina: ${player.stamina} / ${player.maxStamina}`,
      `Level: ${player.level}`,
      ``,
      `Arcane Ash (AA): ${player.arcaneAsh}`,
      `Crystalline Animus (CA): ${player.crystallineAnimus.toFixed(1)}`,
    ].join('\n');
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
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    return container;
  }

  private showMessage(message: string): void {
    const msg = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, message, {
      fontSize: '18px',
      color: '#00ff00',
      backgroundColor: '#000000',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: msg,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 1500,
      onComplete: () => msg.destroy(),
    });
  }
}
