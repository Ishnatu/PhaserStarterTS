import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { Delve, DelveRoom } from '../types/GameTypes';

export class DelveScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private currentDelve!: Delve;
  private roomDisplay!: Phaser.GameObjects.Container;

  constructor() {
    super('DelveScene');
  }

  init(data: { delve: Delve }) {
    this.currentDelve = data.delve;
  }

  create() {
    this.gameState = GameStateManager.getInstance();
    this.gameState.setScene('delve');

    const { width, height } = this.cameras.main;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    this.add.text(width / 2, 30, `Delve - Tier ${this.currentDelve.tier}`, {
      fontSize: '24px',
      color: '#ff8844',
    }).setOrigin(0.5);

    this.renderDelveMap();
    this.renderCurrentRoom();

    const exitBtn = this.createButton(width - 100, 20, 'Exit Delve', () => {
      SceneManager.getInstance().transitionTo('explore');
    });
  }

  private renderDelveMap(): void {
    const { width } = this.cameras.main;
    const mapY = 80;
    const roomSpacing = 80;
    const startX = width / 2 - ((this.currentDelve.rooms.size - 1) * roomSpacing) / 2;

    let index = 0;
    this.currentDelve.rooms.forEach((room, roomId) => {
      const x = startX + index * roomSpacing;
      const y = mapY;

      const isCurrent = roomId === this.currentDelve.currentRoomId;
      const color = this.getRoomColor(room, isCurrent);

      const roomIcon = this.add.circle(x, y, 20, color);
      
      if (isCurrent) {
        const glow = this.add.circle(x, y, 28, color, 0.3);
        this.tweens.add({
          targets: glow,
          scale: 1.2,
          alpha: 0.1,
          duration: 800,
          yoyo: true,
          repeat: -1,
        });
      }

      const label = this.add.text(x, y + 35, this.getRoomLabel(room), {
        fontSize: '10px',
        color: '#cccccc',
      }).setOrigin(0.5);

      if (index < this.currentDelve.rooms.size - 1) {
        this.add.line(0, 0, x + 20, y, x + roomSpacing - 20, y, 0x666666).setOrigin(0);
      }

      index++;
    });
  }

  private renderCurrentRoom(): void {
    const { width, height } = this.cameras.main;
    const currentRoom = this.currentDelve.rooms.get(this.currentDelve.currentRoomId);

    if (!currentRoom) return;

    const roomY = 200;

    this.add.rectangle(width / 2, roomY + 100, 600, 200, 0x2a2a4e, 0.5).setOrigin(0.5);

    this.add.text(width / 2, roomY, this.getRoomDescription(currentRoom), {
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 500 },
    }).setOrigin(0.5);

    const btnY = roomY + 180;

    if (currentRoom.type === 'combat' || currentRoom.type === 'boss') {
      this.createButton(width / 2, btnY, 'Enter Combat', () => {
        this.startCombat(currentRoom);
      });
    } else if (currentRoom.type === 'treasure') {
      this.createButton(width / 2, btnY, 'Collect Treasure', () => {
        this.collectTreasure(currentRoom);
      });
    } else {
      this.createButton(width / 2, btnY, 'Solve Challenge', () => {
        this.solveChallenge(currentRoom);
      });
    }

    if (currentRoom.connections.length > 0 && currentRoom.completed) {
      this.createButton(width / 2, btnY + 60, 'Proceed to Next Room', () => {
        this.moveToNextRoom(currentRoom);
      });
    }
  }

  private getRoomColor(room: DelveRoom, isCurrent: boolean): number {
    if (isCurrent) return 0xffaa00;
    if (room.completed) return 0x00aa00;
    
    switch (room.type) {
      case 'combat': return 0xff4444;
      case 'boss': return 0x8b0000;
      case 'treasure': return 0xffcc00;
      case 'puzzle': return 0x4488ff;
      case 'trap': return 0xff8800;
      default: return 0x888888;
    }
  }

  private getRoomLabel(room: DelveRoom): string {
    if (room.type === 'boss') return 'BOSS';
    return room.type.toUpperCase();
  }

  private getRoomDescription(room: DelveRoom): string {
    switch (room.type) {
      case 'combat':
        return 'Hostile creatures lurk in this chamber.\nPrepare for battle!';
      case 'boss':
        return 'A powerful presence fills this room...\nThe final challenge awaits!';
      case 'treasure':
        return 'Glittering treasure catches your eye.\nClaim your reward!';
      case 'puzzle':
        return 'Ancient mechanisms guard this passage.\nSolve the puzzle to proceed.';
      case 'trap':
        return 'Something feels wrong here...\nProceed with caution.';
      default:
        return 'A mysterious chamber.';
    }
  }

  private startCombat(room: DelveRoom): void {
    SceneManager.getInstance().transitionTo('combat', {
      delve: this.currentDelve,
      room: room,
    });
  }

  private collectTreasure(room: DelveRoom): void {
    room.completed = true;
    this.gameState.addArcaneAsh(50 * this.currentDelve.tier);
    this.gameState.addCrystallineAnimus(0.5 * this.currentDelve.tier);
    this.showMessage('Treasure collected!');
    this.scene.restart({ delve: this.currentDelve });
  }

  private solveChallenge(room: DelveRoom): void {
    room.completed = true;
    this.showMessage('Challenge overcome!');
    this.scene.restart({ delve: this.currentDelve });
  }

  private moveToNextRoom(room: DelveRoom): void {
    const nextRoomId = room.connections.find(id => {
      const nextRoom = this.currentDelve.rooms.get(id);
      return nextRoom && !nextRoom.completed;
    });

    if (nextRoomId) {
      this.currentDelve.currentRoomId = nextRoomId;
      this.scene.restart({ delve: this.currentDelve });
    }
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 200, 40, 0x444466)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x555577))
      .on('pointerout', () => bg.setFillStyle(0x444466))
      .on('pointerdown', callback);

    const label = this.add.text(0, 0, text, {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);

    return this.add.container(x, y, [bg, label]);
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
