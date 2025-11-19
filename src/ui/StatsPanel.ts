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
  private evasionIcon: Phaser.GameObjects.Image;
  private shieldIcon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    
    // Create dark panel background with proper padding
    const panelWidth = 440;  // Slightly wider to accommodate larger icons
    const panelPadding = 15;
    const panelHeight = 220;  // Slightly taller for better spacing
    
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
    
    // Vertical spacing between elements
    let yPos = panelPadding;
    
    // Create health bar
    this.healthBar = new PixelArtBar(
      scene,
      panelPadding,
      yPos,
      'HP',
      0xcc3333,  // Red fill
      0x4a5a8a,  // Blue-gray empty
      panelWidth - (panelPadding * 2),
      36
    );
    this.container.add(this.healthBar.getContainer());
    yPos += 48;  // Bar height + spacing
    
    // Create stamina bar
    this.staminaBar = new PixelArtBar(
      scene,
      panelPadding,
      yPos,
      'SP',
      0xccaa33,  // Yellow-gold fill
      0x4a5a6a,  // Gray empty
      panelWidth - (panelPadding * 2),
      36
    );
    this.container.add(this.staminaBar.getContainer());
    yPos += 55;  // Bar height + more spacing before currency
    
    // Currency will be added in update() at yPos
    
    // Level text
    yPos += 35;  // Currency height + spacing
    this.levelText = scene.add.text(panelPadding + 5, yPos, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.container.add(this.levelText);
    
    // Stats row with icons
    yPos += 30;  // Spacing after level
    
    // Load evasion icon (pixel art running person)
    this.evasionIcon = scene.add.image(panelPadding + 5, yPos, 'evasion-icon');
    this.evasionIcon.setScale(0.06);  // Increased from 0.044 for better visibility
    this.evasionIcon.setOrigin(0, 0.5);
    this.container.add(this.evasionIcon);
    
    // Evasion text (next to foot icon with gap)
    this.evasionText = scene.add.text(panelPadding + 47, yPos, '', {  // Increased gap from 40 to 47
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.evasionText.setOrigin(0, 0.5);
    this.container.add(this.evasionText);
    
    // Load shield icon (pixel art shield)
    this.shieldIcon = scene.add.image(panelWidth / 2 + 10, yPos, 'shield-icon');
    this.shieldIcon.setScale(0.06);  // Increased from 0.044 for better visibility
    this.shieldIcon.setOrigin(0, 0.5);
    this.container.add(this.shieldIcon);
    
    // Damage Reduction text (next to shield icon with gap)
    this.drText = scene.add.text(panelWidth / 2 + 52, yPos, '', {  // Increased gap
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
      118,  // Position after stamina bar
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
