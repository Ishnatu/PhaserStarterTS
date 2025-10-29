import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneManager } from '../systems/SceneManager';
import { DelveGenerator } from '../systems/DelveGenerator';
import { EnemyFactory } from '../systems/EnemyFactory';
import { GameConfig } from '../config/GameConfig';

export class ExploreScene extends Phaser.Scene {
  private gameState!: GameStateManager;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private delveMarkers: Phaser.GameObjects.Container[] = [];
  private infoText!: Phaser.GameObjects.Text;
  private movementStepCounter: number = 0;
  private encounterCooldown: boolean = false;
  private staminaDebt: number = 0;
  private readonly TILE_SIZE: number = 32;

  constructor() {
    super('ExploreScene');
  }

  init(data?: { returnToLocation?: { x: number; y: number } }) {
    if (data?.returnToLocation) {
      this.registry.set('returnToLocation', data.returnToLocation);
    }
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

    const returnLocation = this.registry.get('returnToLocation') as { x: number; y: number } | undefined;
    const playerData = this.gameState.getPlayer();
    
    if (returnLocation) {
      this.player = this.add.rectangle(returnLocation.x, returnLocation.y, 32, 32, 0x4488ff);
      this.registry.remove('returnToLocation');
    } else {
      this.player = this.add.rectangle(width / 2, height / 2, 32, 32, 0x4488ff);
    }

    this.generateDelves();

    this.cursors = this.input.keyboard!.createCursorKeys();

    const returnBtn = this.createButton(width - 120, 20, 'Return to Town', () => {
      SceneManager.getInstance().transitionTo('town');
    });

    const restBtn = this.createButton(width - 120, 60, 'Short Rest', () => {
      this.takeShortRest();
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

  private drainStaminaForMovement(pixelsMoved: number): void {
    const tilesMoved = pixelsMoved / this.TILE_SIZE;
    this.staminaDebt += tilesMoved * GameConfig.STAMINA.MOVEMENT_DRAIN_RATE;

    if (this.staminaDebt >= 1) {
      const staminaToDrain = Math.floor(this.staminaDebt);
      this.staminaDebt -= staminaToDrain;

      const player = this.gameState.getPlayer();
      player.stamina = Math.max(0, player.stamina - staminaToDrain);
      this.gameState.updatePlayer(player);
    }
  }

  update() {
    const playerData = this.gameState.getPlayer();
    const speed = 3;
    let pixelsMoved = 0;

    const canMove = playerData.stamina > 0;

    if (canMove) {
      if (this.cursors.left.isDown) {
        this.player.x -= speed;
        pixelsMoved += speed;
      }
      if (this.cursors.right.isDown) {
        this.player.x += speed;
        pixelsMoved += speed;
      }
      if (this.cursors.up.isDown) {
        this.player.y -= speed;
        pixelsMoved += speed;
      }
      if (this.cursors.down.isDown) {
        this.player.y += speed;
        pixelsMoved += speed;
      }

      if (pixelsMoved > 0) {
        this.drainStaminaForMovement(pixelsMoved);
        
        this.movementStepCounter++;
        if (this.movementStepCounter > 30 && !this.encounterCooldown) {
          this.checkRandomEncounter();
        }
        this.checkDelveProximity();
      }
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
        this.enterDelve(marker.getData('tier'), marker.x, marker.y);
      }
    }
  }

  private enterDelve(tier: number, x: number, y: number): void {
    const generator = new DelveGenerator();
    const delve = generator.generateDelve(tier);
    delve.location = { x, y };
    
    SceneManager.getInstance().transitionTo('delve', { delve });
  }

  private checkRandomEncounter(): void {
    if (Math.random() < GameConfig.WORLD.RANDOM_ENCOUNTER_CHANCE) {
      this.movementStepCounter = 0;
      this.encounterCooldown = true;
      this.triggerEncounter();
    }
  }

  private triggerEncounter(): void {
    const encounterType = this.generateRandomEncounter();
    
    const overlay = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      500,
      300,
      0x000000,
      0.9
    ).setOrigin(0.5);

    const titleText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 100,
      'Random Encounter!',
      {
        fontSize: '24px',
        color: '#ff8844',
      }
    ).setOrigin(0.5);

    const descText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 30,
      encounterType.description,
      {
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 400 },
      }
    ).setOrigin(0.5);

    if (encounterType.type === 'combat' && encounterType.enemies) {
      this.createButton(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 80,
        'Fight!',
        () => {
          overlay.destroy();
          titleText.destroy();
          descText.destroy();
          this.startWildCombat(encounterType.enemies!);
        }
      );
    } else if (encounterType.type === 'treasure' && encounterType.loot) {
      const loot = encounterType.loot;
      this.gameState.addArcaneAsh(loot.aa);
      this.gameState.addCrystallineAnimus(loot.ca);
      
      const lootText = this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 40,
        `+${loot.aa} AA, +${loot.ca.toFixed(1)} CA`,
        {
          fontSize: '18px',
          color: '#ffcc00',
        }
      ).setOrigin(0.5);

      this.time.delayedCall(3000, () => {
        overlay.destroy();
        titleText.destroy();
        descText.destroy();
        lootText.destroy();
        this.encounterCooldown = false;
      });
    } else {
      this.time.delayedCall(2500, () => {
        overlay.destroy();
        titleText.destroy();
        descText.destroy();
        this.encounterCooldown = false;
      });
    }
  }

  private generateRandomEncounter(): any {
    const roll = Math.random();
    
    if (roll < 0.5) {
      const numEnemies = Math.floor(Math.random() * 2) + 1;
      const enemies = [];
      for (let i = 0; i < numEnemies; i++) {
        enemies.push(EnemyFactory.createWildEnemy());
      }
      
      return {
        type: 'combat',
        description: `You've been ambushed by ${numEnemies} ${enemies[0].name}${numEnemies > 1 ? 's' : ''}!`,
        enemies,
      };
    } else if (roll < 0.75) {
      const aa = Math.floor(Math.random() * 30) + 10;
      const ca = (Math.random() * 2).toFixed(1);
      
      return {
        type: 'treasure',
        description: 'You stumble upon a hidden cache of resources!',
        loot: { aa, ca: parseFloat(ca) },
      };
    } else {
      const events = [
        'You notice strange markings on a nearby tree...',
        'A mysterious fog rolls through, but passes harmlessly.',
        'You hear distant howling, but see nothing.',
        'Ancient ruins peek through the undergrowth.',
      ];
      
      return {
        type: 'event',
        description: events[Math.floor(Math.random() * events.length)],
      };
    }
  }

  private startWildCombat(enemies: any[]): void {
    const generator = new DelveGenerator();
    const mockDelve = generator.generateDelve(1);
    const mockRoom = mockDelve.rooms.get(mockDelve.entranceRoomId)!;
    mockRoom.type = 'combat';
    
    SceneManager.getInstance().transitionTo('combat', {
      delve: mockDelve,
      room: mockRoom,
      wildEncounter: true,
      wildEnemies: enemies,
    });
  }

  private takeShortRest(): void {
    const player = this.gameState.getPlayer();
    
    const restOverlay = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      400,
      200,
      0x000000,
      0.8
    ).setOrigin(0.5);

    const restingText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 40,
      'Resting...',
      {
        fontSize: '24px',
        color: '#ffffff',
      }
    ).setOrigin(0.5);

    this.time.delayedCall(GameConfig.STAMINA.REST_DURATION, () => {
      const encounterChance = GameConfig.STAMINA.WILDERNESS_ENCOUNTER_CHANCE_WHILE_RESTING;
      
      if (Math.random() < encounterChance) {
        restingText.setText('Ambushed during rest!');
        this.time.delayedCall(1500, () => {
          restOverlay.destroy();
          restingText.destroy();
          this.encounterCooldown = false;
          
          const numEnemies = Math.floor(Math.random() * 2) + 1;
          const enemies = [];
          for (let i = 0; i < numEnemies; i++) {
            enemies.push(EnemyFactory.createWildEnemy());
          }
          this.startWildCombat(enemies);
        });
      } else {
        const healthRecovered = Math.floor(player.maxHealth * GameConfig.STAMINA.REST_RECOVERY_PERCENT);
        const staminaRecovered = Math.floor(player.maxStamina * GameConfig.STAMINA.REST_RECOVERY_PERCENT);
        
        player.health = Math.min(player.maxHealth, player.health + healthRecovered);
        player.stamina = Math.min(player.maxStamina, player.stamina + staminaRecovered);
        this.gameState.updatePlayer(player);
        
        restingText.setText(`Rested!\n+${healthRecovered} HP, +${staminaRecovered} Stamina`);
        
        this.time.delayedCall(2000, () => {
          restOverlay.destroy();
          restingText.destroy();
        });
      }
    });
  }

  private updateInfo(): void {
    const player = this.gameState.getPlayer();
    this.infoText.setText([
      `HP: ${player.health}/${player.maxHealth}`,
      `Stamina: ${player.stamina}/${player.maxStamina}`,
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
