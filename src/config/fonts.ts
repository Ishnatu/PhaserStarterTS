export const FONTS = {
  primary: '"Press Start 2P", monospace',
  size: {
    xsmall: '14px',     // Extra small for stats and UI details
    small: '20px',      // Was 16px, increased by 25%
    medium: '25px',     // Was 20px, increased by 25%
    large: '35px',      // Was 28px, increased by 25%
    xlarge: '45px',     // Was 36px, increased by 25%
    title: '60px',      // Was 48px, increased by 25%
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
