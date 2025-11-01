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
});
