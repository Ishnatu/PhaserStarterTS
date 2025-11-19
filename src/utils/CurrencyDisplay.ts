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
    icon.setScale(0.06);  // Increased from 0.044 for better readability
    icon.setOrigin(0, 0.5);
    
    const displayAmount = currencyType === 'CA' ? amount.toFixed(1) : amount.toString();
    const text = scene.add.text(40, 0, displayAmount, {  // Increased gap from 28 to 40
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
      resolution: 2,
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
    fontSize: keyof typeof FONTS.size = 'medium'
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);
    
    const aaIcon = scene.add.image(0, 0, 'coin-aa');
    aaIcon.setScale(0.06);  // Increased from 0.044 for better readability
    aaIcon.setOrigin(0, 0.5);
    
    const aaText = scene.add.text(57, 0, `${aaAmount}`, {  // Increased gap from 42 to 57 (added 15px)
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
      resolution: 2,
    });
    aaText.setOrigin(0, 0.5);
    
    const spacing = 30;  // Increased from 20 for more breathing room
    const caXOffset = 57 + aaText.width + spacing;
    
    const caIcon = scene.add.image(caXOffset, 0, 'coin-ca');
    caIcon.setScale(0.06);  // Increased from 0.044 for better readability
    caIcon.setOrigin(0, 0.5);
    
    const caText = scene.add.text(caXOffset + 57, 0, `${caAmount.toFixed(1)}`, {  // Increased gap from 42 to 57 (added 15px)
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
      resolution: 2,
    });
    caText.setOrigin(0, 0.5);
    
    container.add([aaIcon, aaText, caIcon, caText]);
    return container;
  }

  static createStackedCurrency(
    scene: Phaser.Scene,
    x: number,
    y: number,
    aaAmount: number,
    caAmount: number,
    fontSize: keyof typeof FONTS.size = 'xsmall',
    verticalSpacing: number = 22
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);
    
    // AA (top row)
    const aaIcon = scene.add.image(0, 0, 'coin-aa');
    aaIcon.setScale(0.06);
    aaIcon.setOrigin(0, 0.5);
    
    const aaText = scene.add.text(42, 0, `${aaAmount}`, {
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
      resolution: 2,
    });
    aaText.setOrigin(0, 0.5);
    
    // CA (bottom row)
    const caIcon = scene.add.image(0, verticalSpacing, 'coin-ca');
    caIcon.setScale(0.06);
    caIcon.setOrigin(0, 0.5);
    
    const caText = scene.add.text(42, verticalSpacing, `${caAmount.toFixed(1)}`, {
      fontSize: FONTS.size[fontSize],
      color: '#ffffff',
      fontFamily: FONTS.primary,
      resolution: 2,
    });
    caText.setOrigin(0, 0.5);
    
    container.add([aaIcon, aaText, caIcon, caText]);
    return container;
  }
}
