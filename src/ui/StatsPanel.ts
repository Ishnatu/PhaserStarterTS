import Phaser from 'phaser';
import { PixelArtBar } from '../utils/PixelArtBar';
import { CurrencyDisplay } from '../utils/CurrencyDisplay';
import { FONTS } from '../config/fonts';
import type { PlayerData } from '../types/GameTypes';

export class StatsPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private panel: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Graphics;
  private healthBar: PixelArtBar;
  private staminaBar: PixelArtBar;
  private currencyDisplay: Phaser.GameObjects.Container | null = null;
  private levelText: Phaser.GameObjects.Text;
  private evasionText: Phaser.GameObjects.Text;
  private drText: Phaser.GameObjects.Text;
  private footIcon: Phaser.GameObjects.Image;
  private shieldIcon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    
    // Create dark panel background (matching inventory style)
    const panelWidth = 420;
    const panelHeight = 200;
    this.panel = scene.add.rectangle(0, 0, panelWidth, panelHeight, 0x2a2a3e);
    this.panel.setOrigin(0, 0);
    
    // Create pixel art border
    this.border = scene.add.graphics();
    this.border.lineStyle(2, 0x4a4a6a, 1);
    this.border.strokeRect(0, 0, panelWidth, panelHeight);
    
    // Add inner border for depth
    this.border.lineStyle(1, 0x5a5a7a, 0.5);
    this.border.strokeRect(2, 2, panelWidth - 4, panelHeight - 4);
    
    this.container.add([this.panel, this.border]);
    
    // Create health bar
    this.healthBar = new PixelArtBar(
      scene,
      15,
      15,
      'HP',
      0xcc3333,  // Red fill
      0x4a5a8a,  // Blue-gray empty
      390,
      28
    );
    this.container.add(this.healthBar.getContainer());
    
    // Create stamina bar
    this.staminaBar = new PixelArtBar(
      scene,
      15,
      50,
      'SP',
      0xccaa33,  // Yellow-gold fill
      0x4a5a6a,  // Gray empty
      390,
      28
    );
    this.container.add(this.staminaBar.getContainer());
    
    // Currency display (will be created in update)
    
    // Level text
    this.levelText = scene.add.text(20, 125, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.container.add(this.levelText);
    
    // Load stat icons
    this.footIcon = scene.add.image(20, 152, 'foot-icon');
    this.footIcon.setScale(0.8);
    this.footIcon.setOrigin(0, 0.5);
    this.container.add(this.footIcon);
    
    this.shieldIcon = scene.add.image(220, 152, 'shield-icon');
    this.shieldIcon.setScale(0.8);
    this.shieldIcon.setOrigin(0, 0.5);
    this.container.add(this.shieldIcon);
    
    // Evasion text (next to foot icon)
    this.evasionText = scene.add.text(45, 152, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.evasionText.setOrigin(0, 0.5);
    this.container.add(this.evasionText);
    
    // Damage Reduction text (next to shield icon)
    this.drText = scene.add.text(245, 152, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.drText.setOrigin(0, 0.5);
    this.container.add(this.drText);
    
    this.container.setDepth(100);
  }
  
  public update(player: PlayerData): void {
    // Update bars
    this.healthBar.update(player.health, player.maxHealth);
    this.staminaBar.update(player.stamina, player.maxStamina);
    
    // Update currency display
    if (this.currencyDisplay) {
      this.currencyDisplay.destroy();
    }
    this.currencyDisplay = CurrencyDisplay.createInlineCurrency(
      this.scene,
      20,
      95,
      player.arcaneAsh,
      player.crystallineAnimus,
      'small'
    );
    this.container.add(this.currencyDisplay);
    
    // Update level
    this.levelText.setText(`Level: ${player.level}`);
    
    // Update evasion
    this.evasionText.setText(`Evasion: ${player.stats.calculatedEvasion}`);
    
    // Update damage reduction
    const drPercent = Math.floor(player.stats.damageReduction * 100);
    this.drText.setText(`DR: ${drPercent}%`);
  }
  
  public setDepth(depth: number): void {
    this.container.setDepth(depth);
  }
  
  public destroy(): void {
    if (this.currencyDisplay) {
      this.currencyDisplay.destroy();
    }
    this.healthBar.destroy();
    this.staminaBar.destroy();
    this.container.destroy();
  }
  
  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }
}
