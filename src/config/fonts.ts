export const FONTS = {
  primary: 'VT323, monospace',
  size: {
    small: '16px',
    medium: '20px',
    large: '28px',
    xlarge: '36px',
    title: '48px',
  }
};

export const getTextStyle = (size: keyof typeof FONTS.size, color: string = '#ffffff') => ({
  fontFamily: FONTS.primary,
  fontSize: FONTS.size[size],
  color,
  resolution: 2,
});

// Helper to create crisp text in Phaser scenes
export function createCrispText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle
): Phaser.GameObjects.Text {
  const textObj = scene.add.text(x, y, text, {
    ...style,
    resolution: 2,
  });
  return textObj;
}
