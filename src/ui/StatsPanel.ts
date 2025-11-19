import Phaser from 'phaser';
import { PixelArtBar } from '../utils/PixelArtBar';
import { CurrencyDisplay } from '../utils/CurrencyDisplay';
import { FONTS } from '../config/fonts';
import type { PlayerData } from '../types/GameTypes';

export class StatsPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private healthBar: PixelArtBar;
  private staminaBar: PixelArtBar;
  private aaIcon: Phaser.GameObjects.Image | null = null;
  private aaText: Phaser.GameObjects.Text | null = null;
  private caIcon: Phaser.GameObjects.Image | null = null;
  private caText: Phaser.GameObjects.Text | null = null;
  private evasionIcon: Phaser.GameObjects.Image;
  private evasionText: Phaser.GameObjects.Text;
  private shieldIcon: Phaser.GameObjects.Image;
  private drText: Phaser.GameObjects.Text;
  private levelText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    
    // Layout constants
    const barWidth = 360;  // Reduced width to match user's cutoff line
    const iconScale = 0.06;
    const iconGap = 22;  // 22px gap between icons
    const textOffset = 60;  // Increased gap so text doesn't overlap icons
    const iconX = 5;  // X position for all icons
    const textX = iconX + textOffset;  // X position for all text
    
    // Track Y position based on icon bottoms
    let currentY = 0;
    
    // Create health bar
    this.healthBar = new PixelArtBar(
      scene,
      0,
      currentY,
      'HP',
      0xcc3333,  // Red fill
      0x4a5a8a,  // Blue-gray empty
      barWidth,
      36
    );
    this.container.add(this.healthBar.getContainer());
    currentY += 36 + 12;  // Bar height + small gap
    
    // Create stamina bar
    this.staminaBar = new PixelArtBar(
      scene,
      0,
      currentY,
      'SP',
      0xccaa33,  // Yellow-gold fill
      0x4a5a6a,  // Gray empty
      barWidth,
      36
    );
    this.container.add(this.staminaBar.getContainer());
    
    // Calculate position for AA icon: SP bar bottom + 22px gap + half of AA icon height
    // First create the icon to get its displayHeight
    this.aaIcon = scene.add.image(0, 0, 'coin-aa');
    this.aaIcon.setScale(iconScale);
    this.aaIcon.setOrigin(0, 0.5);
    // Now position it: SP bar bottom (currentY + 36) + 22px + half icon height
    currentY = currentY + 36 + iconGap + this.aaIcon.displayHeight / 2;
    this.aaIcon.setPosition(iconX, currentY);
    this.container.add(this.aaIcon);
    
    this.aaText = scene.add.text(textX, currentY, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      resolution: 2,
    });
    this.aaText.setOrigin(0, 0.5);
    this.container.add(this.aaText);
    
    // CA Icon: AA icon bottom + 22px + half of CA icon height
    this.caIcon = scene.add.image(0, 0, 'coin-ca');
    this.caIcon.setScale(iconScale);
    this.caIcon.setOrigin(0, 0.5);
    currentY = currentY + this.aaIcon.displayHeight / 2 + iconGap + this.caIcon.displayHeight / 2;
    this.caIcon.setPosition(iconX, currentY);
    this.container.add(this.caIcon);
    
    this.caText = scene.add.text(textX, currentY, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      resolution: 2,
    });
    this.caText.setOrigin(0, 0.5);
    this.container.add(this.caText);
    
    // Evasion Icon: CA icon bottom + 22px + half of evasion icon height
    this.evasionIcon = scene.add.image(0, 0, 'evasion-icon');
    this.evasionIcon.setScale(iconScale);
    this.evasionIcon.setOrigin(0, 0.5);
    currentY = currentY + this.caIcon.displayHeight / 2 + iconGap + this.evasionIcon.displayHeight / 2;
    this.evasionIcon.setPosition(iconX, currentY);
    this.container.add(this.evasionIcon);
    
    this.evasionText = scene.add.text(textX, currentY, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      resolution: 2,
    });
    this.evasionText.setOrigin(0, 0.5);
    this.container.add(this.evasionText);
    
    // DR Icon: Evasion icon bottom + 22px + half of DR icon height
    this.shieldIcon = scene.add.image(0, 0, 'shield-icon');
    this.shieldIcon.setScale(iconScale);
    this.shieldIcon.setOrigin(0, 0.5);
    currentY = currentY + this.evasionIcon.displayHeight / 2 + iconGap + this.shieldIcon.displayHeight / 2;
    this.shieldIcon.setPosition(iconX, currentY);
    this.container.add(this.shieldIcon);
    
    this.drText = scene.add.text(textX, currentY, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      resolution: 2,
    });
    this.drText.setOrigin(0, 0.5);
    this.container.add(this.drText);
    
    // Level text: DR icon bottom + 22px
    currentY = currentY + this.shieldIcon.displayHeight / 2 + iconGap;
    
    // Level text (below DR)
    this.levelText = scene.add.text(textX, currentY, '', {  // Changed from iconX to textX
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ffffff',
      resolution: 2,
    });
    this.levelText.setOrigin(0, 0.5);
    this.container.add(this.levelText);
    
    this.container.setDepth(100);
  }
  
  public update(player: PlayerData): void {
    // Update bars
    this.healthBar.update(player.health, player.maxHealth);
    this.staminaBar.update(player.stamina, player.maxStamina);
    
    // Update currency values
    if (this.aaText) {
      this.aaText.setText(`${player.arcaneAsh}`);
    }
    if (this.caText) {
      this.caText.setText(`${player.crystallineAnimus.toFixed(1)}`);
    }
    
    // Update evasion
    this.evasionText.setText(`Evasion: ${player.stats.calculatedEvasion}`);
    
    // Update damage reduction
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
