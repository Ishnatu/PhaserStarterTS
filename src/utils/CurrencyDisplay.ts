import Phaser from 'phaser';
import { FONTS } from '../config/fonts';

export class CurrencyDisplay {
  static createCurrencyText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    amount: number,
    currencyType: 'AA' | 'CA',
    fontSize: keyof typeof FONTS.size = 'medium'
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);
    
    const iconKey = currencyType === 'AA' ? 'coin-aa' : 'coin-ca';
    const icon = scene.add.image(0, 0, iconKey);
    icon.setScale(0.035);
    icon.setOrigin(0, 0.5);
    
    const text = scene.add.text(28, 0, `${amount}${currencyType === 'CA' ? amount.toFixed(1) : ''}`, {
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
    });
    text.setOrigin(0, 0.5);
    
    container.add([icon, text]);
    return container;
  }

  static createInlineCurrency(
    scene: Phaser.Scene,
    x: number,
    y: number,
    aaAmount: number,
    caAmount: number,
    fontSize: keyof typeof FONTS.size = 'medium',
    separator: string = '  |  '
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);
    
    const aaIcon = scene.add.image(0, 0, 'coin-aa');
    aaIcon.setScale(0.035);
    aaIcon.setOrigin(0, 0.5);
    
    const aaText = scene.add.text(28, 0, `${aaAmount}`, {
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
    });
    aaText.setOrigin(0, 0.5);
    
    const separatorText = scene.add.text(28 + aaText.width + 8, 0, separator, {
      fontSize: FONTS.size[fontSize],
      color: '#666666',
      fontFamily: FONTS.primary,
    });
    separatorText.setOrigin(0, 0.5);
    
    const caIcon = scene.add.image(28 + aaText.width + 8 + separatorText.width + 8, 0, 'coin-ca');
    caIcon.setScale(0.035);
    caIcon.setOrigin(0, 0.5);
    
    const caText = scene.add.text(28 + aaText.width + 8 + separatorText.width + 8 + 28, 0, `${caAmount.toFixed(1)}`, {
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
    });
    caText.setOrigin(0, 0.5);
    
    container.add([aaIcon, aaText, separatorText, caIcon, caText]);
    return container;
  }
}
