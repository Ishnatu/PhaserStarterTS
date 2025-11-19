import Phaser from 'phaser';
import { PixelArtBar } from '../utils/PixelArtBar';
import { FONTS } from '../config/fonts';
import type { PlayerData } from '../types/GameTypes';

export class StatsPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private panel: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Graphics;
  private healthBar: PixelArtBar;
  private staminaBar: PixelArtBar;
  
  // Currency elements
  private aaIcon: Phaser.GameObjects.Image;
  private aaText: Phaser.GameObjects.Text;
  private caIcon: Phaser.GameObjects.Image;
  private caText: Phaser.GameObjects.Text;
  
  // Stat elements
  private evasionIcon: Phaser.GameObjects.Image;
  private evasionText: Phaser.GameObjects.Text;
  private shieldIcon: Phaser.GameObjects.Image;
  private drText: Phaser.GameObjects.Text;
  private levelText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    
    // Create dark panel background - taller for vertical layout
    const panelWidth = 420;
    const panelHeight = 380;  // Taller to accommodate vertical layout
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
    
    // Vertical spacing
    let yPos = 15;
    
    // 1. HP Bar
    this.healthBar = new PixelArtBar(
      scene,
      15,
      yPos,
      'HP',
      0xcc3333,  // Red fill
      0x4a5a8a,  // Blue-gray empty
      390,
      36  // Taller bars
    );
    this.container.add(this.healthBar.getContainer());
    yPos += 60;  // Bar height + spacing
    
    // 2. SP Bar
    this.staminaBar = new PixelArtBar(
      scene,
      15,
      yPos,
      'SP',
      0xccaa33,  // Yellow-gold fill
      0x4a5a6a,  // Gray empty
      390,
      36  // Taller bars
    );
    this.container.add(this.staminaBar.getContainer());
    yPos += 70;  // Bar height + more spacing before currency
    
    // 3. AA Currency (icon + text)
    this.aaIcon = scene.add.image(20, yPos, 'coin-aa');
    this.aaIcon.setScale(0.044);
    this.aaIcon.setOrigin(0, 0.5);
    this.container.add(this.aaIcon);
    
    this.aaText = scene.add.text(55, yPos, '0', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.aaText.setOrigin(0, 0.5);
    this.container.add(this.aaText);
    yPos += 35;  // Spacing between currency rows
    
    // 4. CA Currency (icon + text)
    this.caIcon = scene.add.image(20, yPos, 'coin-ca');
    this.caIcon.setScale(0.044);
    this.caIcon.setOrigin(0, 0.5);
    this.container.add(this.caIcon);
    
    this.caText = scene.add.text(55, yPos, '0.0', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.caText.setOrigin(0, 0.5);
    this.container.add(this.caText);
    yPos += 45;  // More spacing before stats
    
    // 5. Evasion (icon + text)
    this.evasionIcon = scene.add.image(20, yPos, 'evasion-icon');
    this.evasionIcon.setScale(0.044);  // Match currency icon size
    this.evasionIcon.setOrigin(0, 0.5);
    this.container.add(this.evasionIcon);
    
    this.evasionText = scene.add.text(55, yPos, 'Evasion: 0', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.evasionText.setOrigin(0, 0.5);
    this.container.add(this.evasionText);
    yPos += 35;  // Spacing between stat rows
    
    // 6. Damage Reduction (icon + text)
    this.shieldIcon = scene.add.image(20, yPos, 'shield-icon');
    this.shieldIcon.setScale(0.044);  // Match currency icon size
    this.shieldIcon.setOrigin(0, 0.5);
    this.container.add(this.shieldIcon);
    
    this.drText = scene.add.text(55, yPos, 'DR: 0%', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.drText.setOrigin(0, 0.5);
    this.container.add(this.drText);
    yPos += 45;  // More spacing before level
    
    // 7. Level
    this.levelText = scene.add.text(20, yPos, 'Level: 1', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    });
    this.container.add(this.levelText);
    
    this.container.setDepth(100);
  }
  
  public update(player: PlayerData): void {
    // Update bars
    this.healthBar.update(player.health, player.maxHealth);
    this.staminaBar.update(player.stamina, player.maxStamina);
    
    // Update currency
    this.aaText.setText(`${player.arcaneAsh}`);
    this.caText.setText(`${player.crystallineAnimus.toFixed(1)}`);
    
    // Update stats
    this.evasionText.setText(`Evasion: ${player.stats.calculatedEvasion}`);
    const drPercent = Math.floor(player.stats.damageReduction * 100);
    this.drText.setText(`DR: ${drPercent}%`);
    
    // Update level
    this.levelText.setText(`Level: ${player.level}`);
  }
  
  public setDepth(depth: number): void {
    this.container.setDepth(depth);
  }
  
  public destroy(): void {
    this.healthBar.destroy();
    this.staminaBar.destroy();
    this.container.destroy();
  }
  
  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }
}
