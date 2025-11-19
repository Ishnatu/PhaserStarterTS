import Phaser from 'phaser';
import { FONTS } from '../config/fonts';

export class PixelArtBar {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private labelText: Phaser.GameObjects.Text;
  private tooltipText: Phaser.GameObjects.Text | null = null;
  private tooltipBg: Phaser.GameObjects.Rectangle | null = null;
  private fillBar: Phaser.GameObjects.Graphics;
  private emptyBar: Phaser.GameObjects.Graphics;
  private interactiveZone: Phaser.GameObjects.Zone;
  
  private barWidth: number;
  private barHeight: number;
  private currentValue: number = 0;
  private maxValue: number = 0;
  
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    fillColor: number,
    emptyColor: number,
    barWidth: number = 400,
    barHeight: number = 36
  ) {
    this.scene = scene;
    this.barWidth = barWidth;
    this.barHeight = barHeight;
    
    this.container = scene.add.container(x, y);
    
    // Label text (e.g., "HP") - slightly smaller
    this.labelText = scene.add.text(8, -32, label, {
      fontFamily: FONTS.primary,
      fontSize: '24px',
      color: '#e8d4a0',
      resolution: 2,
    });
    
    // Create graphics for the bars
    this.fillBar = scene.add.graphics();
    this.emptyBar = scene.add.graphics();
    
    // Draw outer frame (dark border with pixel art style)
    const frame = scene.add.graphics();
    
    // Outer dark border (4px thick)
    frame.fillStyle(0x1a1a2e, 1);
    frame.fillRect(0, 0, barWidth, barHeight);
    
    // Inner lighter border (2px)
    frame.fillStyle(0x3a3a4e, 1);
    frame.fillRect(2, 2, barWidth - 4, barHeight - 4);
    
    // Inner dark area for the bar
    frame.fillStyle(0x0f0f1a, 1);
    frame.fillRect(4, 4, barWidth - 8, barHeight - 8);
    
    // Add pixel art highlights (top-left light edge)
    frame.fillStyle(0x5a5a6e, 1);
    frame.fillRect(4, 4, barWidth - 8, 2); // Top highlight
    frame.fillRect(4, 4, 2, barHeight - 8); // Left highlight
    
    // Add pixel art shadows (bottom-right dark edge)
    frame.fillStyle(0x0a0a0f, 1);
    frame.fillRect(4, barHeight - 6, barWidth - 8, 2); // Bottom shadow
    frame.fillRect(barWidth - 6, 4, 2, barHeight - 8); // Right shadow
    
    // Create interactive zone for hover tooltips
    this.interactiveZone = scene.add.zone(0, 0, barWidth, barHeight)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: false });
    
    // Add hover events
    this.interactiveZone.on('pointerover', () => this.showTooltip());
    this.interactiveZone.on('pointerout', () => this.hideTooltip());
    this.interactiveZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.tooltipText && this.tooltipBg) {
        // Position tooltip near mouse
        const localX = pointer.x - this.container.x - x;
        const localY = pointer.y - this.container.y - y;
        this.tooltipText.setPosition(localX + 15, localY - 25);
        this.tooltipBg.setPosition(localX + 15, localY - 25);
      }
    });
    
    // Add components to container
    this.container.add([frame, this.emptyBar, this.fillBar, this.labelText, this.interactiveZone]);
    
    // Store colors for later use
    this.container.setData('fillColor', fillColor);
    this.container.setData('emptyColor', emptyColor);
    this.container.setData('label', label);
  }
  
  private showTooltip(): void {
    if (!this.tooltipText) {
      const label = this.container.getData('label');
      
      // Create tooltip background
      this.tooltipBg = this.scene.add.rectangle(0, 0, 120, 32, 0x1a1a2e, 0.95)
        .setOrigin(0, 0.5)
        .setStrokeStyle(2, 0x4a4a6a);
      
      // Create tooltip text
      this.tooltipText = this.scene.add.text(8, 0, `${label} ${this.currentValue}/${this.maxValue}`, {
        fontFamily: FONTS.primary,
        fontSize: FONTS.size.small,
        color: '#ffffff',
        resolution: 2,
      }).setOrigin(0, 0.5);
      
      this.container.add([this.tooltipBg, this.tooltipText]);
      this.tooltipBg.setDepth(1000);
      this.tooltipText.setDepth(1001);
    } else {
      this.tooltipText.setVisible(true);
      this.tooltipBg!.setVisible(true);
    }
  }
  
  private hideTooltip(): void {
    if (this.tooltipText) {
      this.tooltipText.setVisible(false);
      this.tooltipBg!.setVisible(false);
    }
  }
  
  public update(current: number, max: number): void {
    this.currentValue = current;
    this.maxValue = max;
    
    // Update tooltip if it exists
    if (this.tooltipText) {
      const label = this.container.getData('label');
      this.tooltipText.setText(`${label} ${current}/${max}`);
    }
    
    // Calculate fill percentage
    const fillPercent = Math.max(0, Math.min(1, current / max));
    const fillWidth = Math.floor((this.barWidth - 12) * fillPercent);
    const emptyWidth = this.barWidth - 12 - fillWidth;
    
    const fillColor = this.container.getData('fillColor');
    const emptyColor = this.container.getData('emptyColor');
    
    // Clear previous graphics
    this.fillBar.clear();
    this.emptyBar.clear();
    
    // Draw filled portion with 3D effect
    if (fillWidth > 0) {
      // Main fill color
      this.fillBar.fillStyle(fillColor, 1);
      this.fillBar.fillRect(6, 8, fillWidth, this.barHeight - 16);
      
      // Top highlight (lighter)
      const highlightColor = Phaser.Display.Color.IntegerToColor(fillColor);
      highlightColor.lighten(20);
      this.fillBar.fillStyle(highlightColor.color, 1);
      this.fillBar.fillRect(6, 8, fillWidth, 4);
      
      // Bottom shadow (darker)
      const shadowColor = Phaser.Display.Color.IntegerToColor(fillColor);
      shadowColor.darken(30);
      this.fillBar.fillStyle(shadowColor.color, 1);
      this.fillBar.fillRect(6, this.barHeight - 12, fillWidth, 4);
    }
    
    // Draw empty portion with 3D effect
    if (emptyWidth > 0) {
      // Main empty color
      this.emptyBar.fillStyle(emptyColor, 1);
      this.emptyBar.fillRect(6 + fillWidth, 8, emptyWidth, this.barHeight - 16);
      
      // Top highlight (lighter)
      const highlightColor = Phaser.Display.Color.IntegerToColor(emptyColor);
      highlightColor.lighten(10);
      this.emptyBar.fillStyle(highlightColor.color, 1);
      this.emptyBar.fillRect(6 + fillWidth, 8, emptyWidth, 4);
      
      // Bottom shadow (darker)
      const shadowColor = Phaser.Display.Color.IntegerToColor(emptyColor);
      shadowColor.darken(20);
      this.emptyBar.fillStyle(shadowColor.color, 1);
      this.emptyBar.fillRect(6 + fillWidth, this.barHeight - 12, emptyWidth, 4);
    }
  }
  
  public setScrollFactor(x: number, y?: number): this {
    this.container.setScrollFactor(x, y);
    return this;
  }
  
  public setDepth(depth: number): this {
    this.container.setDepth(depth);
    return this;
  }
  
  public destroy(): void {
    this.container.destroy();
  }
  
  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }
}
