import { ItemDatabase } from '../config/ItemDatabase';
import { ForgingSystem } from '../systems/ForgingSystem';
import { FONTS } from '../config/fonts';
import type { InventoryItem, EquippedItem, WeaponData, ArmorData, PotionData, DiceRoll } from '../../shared/types';

export class ItemTooltip {
  private scene: Phaser.Scene;
  private tooltipBg: Phaser.GameObjects.Rectangle | null = null;
  private tooltipTexts: Phaser.GameObjects.Text[] = [];
  private isVisible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private formatDamage(damage: { numDice: number; dieSize: number; modifier: number }): string {
    if (damage.modifier === 0) {
      return `${damage.numDice}d${damage.dieSize}`;
    } else if (damage.modifier > 0) {
      return `${damage.numDice}d${damage.dieSize}+${damage.modifier}`;
    } else {
      return `${damage.numDice}d${damage.dieSize}${damage.modifier}`;
    }
  }

  private getWeaponStats(weapon: WeaponData, enhancementLevel: number = 0): string[] {
    const lines: string[] = [];
    const enhancedDamage = ForgingSystem.calculateEnhancedDamage(weapon, enhancementLevel);
    lines.push(`Damage: ${this.formatDamage(enhancedDamage)}`);
    lines.push(`Type: ${weapon.type}`);
    if (weapon.twoHanded) {
      lines.push('Two-Handed');
    }
    return lines;
  }

  private getArmorStats(armor: ArmorData, enhancementLevel: number = 0): string[] {
    const lines: string[] = [];
    
    const enhancementDR = enhancementLevel * 0.01;
    const totalDR = armor.damageReduction + enhancementDR;
    
    if (armor.evasionModifier !== 0) {
      const sign = armor.evasionModifier > 0 ? '+' : '';
      lines.push(`Evasion: ${sign}${armor.evasionModifier}`);
    }
    if (totalDR > 0) {
      lines.push(`Damage Reduction: ${Math.round(totalDR * 100)}%`);
    }
    lines.push(`Type: ${armor.armorType}`);
    lines.push(`Slot: ${armor.slot}`);
    
    return lines;
  }

  private getPotionStats(potion: PotionData): string[] {
    const lines: string[] = [];
    const restore = potion.restoration;
    lines.push(`Restores: ${restore.numDice}d${restore.dieSize}+${restore.modifier}`);
    lines.push(`Type: ${potion.type}`);
    return lines;
  }

  public getItemTooltipLines(item: InventoryItem | EquippedItem): string[] {
    const weapon = ItemDatabase.getWeapon(item.itemId);
    const armor = ItemDatabase.getArmor(item.itemId);
    const potion = ItemDatabase.getPotion(item.itemId);
    
    const enhancementLevel = item.enhancementLevel || 0;
    const lines: string[] = [];

    if (weapon) {
      lines.push(...this.getWeaponStats(weapon, enhancementLevel));
      if (enhancementLevel > 0) {
        lines.push(`Enhancement: +${enhancementLevel}`);
      }
    } else if (armor) {
      lines.push(...this.getArmorStats(armor, enhancementLevel));
      if (enhancementLevel > 0) {
        lines.push(`Enhancement: +${enhancementLevel}`);
      }
    } else if (potion) {
      lines.push(...this.getPotionStats(potion));
    }

    if ((weapon || armor) && item.durability !== undefined) {
      const durability = item.durability ?? 100;
      const maxDurability = item.maxDurability ?? 100;
      lines.push(`Durability: ${Math.floor(durability)}/${maxDurability}`);
    }

    if ((item as InventoryItem).isShiny || (item as EquippedItem).isShiny) {
      lines.push('SHINY (Indestructible)');
    }

    return lines;
  }

  public getEnhancementBenefitText(item: InventoryItem | EquippedItem): string {
    const weapon = ItemDatabase.getWeapon(item.itemId);
    const armor = ItemDatabase.getArmor(item.itemId);
    const currentLevel = item.enhancementLevel || 0;
    const nextLevel = currentLevel + 1;

    if (weapon) {
      const currentDamage = ForgingSystem.calculateEnhancedDamage(weapon, currentLevel);
      const nextDamage = ForgingSystem.calculateEnhancedDamage(weapon, nextLevel);
      
      const benefits: string[] = [];
      
      if (nextDamage.numDice > currentDamage.numDice) {
        benefits.push(`+1d${nextDamage.dieSize}`);
      }
      if (nextDamage.modifier > currentDamage.modifier) {
        benefits.push(`+${nextDamage.modifier - currentDamage.modifier} modifier`);
      }
      
      if (benefits.length === 0) {
        return '+10 max durability';
      }
      
      return `${this.formatDamage(currentDamage)} -> ${this.formatDamage(nextDamage)} (${benefits.join(', ')})`;
    } else if (armor) {
      const currentDR = Math.round(currentLevel * 1);
      const nextDR = Math.round(nextLevel * 1);
      return `${currentDR}% -> ${nextDR}% DR (+1% damage reduction, +10 max durability)`;
    }
    return '';
  }

  public show(x: number, y: number, item: InventoryItem | EquippedItem): void {
    this.hide();

    const lines = this.getItemTooltipLines(item);
    if (lines.length === 0) return;

    const itemData = ItemDatabase.getItem(item.itemId);
    const displayName = itemData ? ForgingSystem.getItemDisplayName(item as InventoryItem) : 'Unknown Item';

    const allLines = [displayName, '', ...lines];
    
    const padding = 12;
    const lineHeight = 18;
    const tooltipWidth = 220;
    const tooltipHeight = allLines.length * lineHeight + padding * 2;

    const screenWidth = this.scene.cameras.main.width;
    const screenHeight = this.scene.cameras.main.height;
    
    let tooltipX = x + 15;
    let tooltipY = y;
    
    if (tooltipX + tooltipWidth > screenWidth - 10) {
      tooltipX = x - tooltipWidth - 15;
    }
    if (tooltipY + tooltipHeight > screenHeight - 10) {
      tooltipY = screenHeight - tooltipHeight - 10;
    }

    this.tooltipBg = this.scene.add.rectangle(
      tooltipX, tooltipY,
      tooltipWidth, tooltipHeight,
      0x1a1a2e, 0.95
    ).setOrigin(0, 0)
      .setStrokeStyle(2, 0x4a4a6a)
      .setScrollFactor(0)
      .setDepth(10000);

    allLines.forEach((line, index) => {
      const isTitle = index === 0;
      const textY = tooltipY + padding + index * lineHeight;
      
      let color = '#cccccc';
      if (isTitle) {
        const weapon = ItemDatabase.getWeapon(item.itemId);
        const armor = ItemDatabase.getArmor(item.itemId);
        if ((item as InventoryItem).isShiny) {
          color = '#ffd700';
        } else if ((item.enhancementLevel || 0) >= 7) {
          color = '#ff6666';
        } else if ((item.enhancementLevel || 0) >= 4) {
          color = '#aa88ff';
        } else if (weapon || armor) {
          color = '#ffffff';
        }
      } else if (line.includes('SHINY')) {
        color = '#ffd700';
      }

      const text = this.scene.add.text(tooltipX + padding, textY, line, {
        fontFamily: FONTS.primary,
        fontSize: isTitle ? FONTS.size.xsmall : '10px',
        color: color,
        resolution: 2,
      }).setScrollFactor(0)
        .setDepth(10001);
      
      this.tooltipTexts.push(text);
    });

    this.isVisible = true;
  }

  public updatePosition(x: number, y: number): void {
    if (!this.isVisible || !this.tooltipBg) return;

    const screenWidth = this.scene.cameras.main.width;
    const screenHeight = this.scene.cameras.main.height;
    const tooltipWidth = this.tooltipBg.width;
    const tooltipHeight = this.tooltipBg.height;

    let tooltipX = x + 15;
    let tooltipY = y;

    if (tooltipX + tooltipWidth > screenWidth - 10) {
      tooltipX = x - tooltipWidth - 15;
    }
    if (tooltipY + tooltipHeight > screenHeight - 10) {
      tooltipY = screenHeight - tooltipHeight - 10;
    }

    this.tooltipBg.setPosition(tooltipX, tooltipY);

    const padding = 12;
    const lineHeight = 18;
    this.tooltipTexts.forEach((text, index) => {
      text.setPosition(tooltipX + padding, tooltipY + padding + index * lineHeight);
    });
  }

  public hide(): void {
    if (this.tooltipBg) {
      this.tooltipBg.destroy();
      this.tooltipBg = null;
    }
    this.tooltipTexts.forEach(text => text.destroy());
    this.tooltipTexts = [];
    this.isVisible = false;
  }

  public destroy(): void {
    this.hide();
  }
}
