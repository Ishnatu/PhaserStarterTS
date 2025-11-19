import Phaser from 'phaser';
import { FONTS } from '../config/fonts';

export class PixelArtBar {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private labelText: Phaser.GameObjects.Text;
  private valueText: Phaser.GameObjects.Text;
  private fillBar: Phaser.GameObjects.Graphics;
  private emptyBar: Phaser.GameObjects.Graphics;
  
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
    barHeight: number = 36  // Increased from 32px to 36px for better visibility
  ) {
    this.scene = scene;
    this.barWidth = barWidth;
    this.barHeight = barHeight;
    
    this.container = scene.add.container(x, y);
    
    // Label text (e.g., "HP")
    this.labelText = scene.add.text(8, -35, label, {
      fontFamily: FONTS.primary,
      fontSize: '30px',  // Increased from 24px (25% increase)
      color: '#e8d4a0',
      resolution: 2,
    });
    
    // Value text (e.g., "150/164")
    this.valueText = scene.add.text(80, -35, '0/0', {
      fontFamily: FONTS.primary,
      fontSize: '30px',  // Increased from 24px (25% increase)
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
    
    // Add components to container
    this.container.add([frame, this.emptyBar, this.fillBar, this.labelText, this.valueText]);
    
    // Store colors for later use
    this.container.setData('fillColor', fillColor);
    this.container.setData('emptyColor', emptyColor);
  }
  
  public update(current: number, max: number): void {
    this.currentValue = current;
    this.maxValue = max;
    
    // Update value text
    this.valueText.setText(`${current}/${max}`);
    
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
