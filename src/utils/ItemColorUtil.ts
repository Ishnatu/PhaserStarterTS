export class ItemColorUtil {
  static getItemColor(enhancementLevel: number | undefined, isShiny: boolean | undefined): string {
    if (isShiny) {
      return '#FFD700';
    }

    const level = enhancementLevel || 0;

    switch (level) {
      case 0:
        return '#FFFFFF';
      case 1:
        return '#90EE90';
      case 2:
        return '#32CD32';
      case 3:
        return '#006400';
      case 4:
        return '#4169E1';
      case 5:
        return '#1E90FF';
      case 6:
        return '#00008B';
      case 7:
        return '#8B008B';
      case 8:
        return '#9400D3';
      case 9:
        return '#FF0000';
      default:
        return '#FFFFFF';
    }
  }

  static getItemColorDescription(enhancementLevel: number | undefined, isShiny: boolean | undefined): string {
    if (isShiny) {
      return 'Shiny (Golden)';
    }

    const level = enhancementLevel || 0;

    switch (level) {
      case 0:
        return 'White (Base)';
      case 1:
        return 'Faint Green (+1)';
      case 2:
        return 'Light Green (+2)';
      case 3:
        return 'Dark Green (+3)';
      case 4:
        return 'Faint Blue (+4)';
      case 5:
        return 'Light Blue (+5)';
      case 6:
        return 'Dark Blue (+6)';
      case 7:
        return 'Faint Purple (+7)';
      case 8:
        return 'Purple (+8)';
      case 9:
        return 'Red (+9)';
      default:
        return 'White (Base)';
    }
  }
}
