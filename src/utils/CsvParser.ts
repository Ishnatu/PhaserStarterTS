import { EnemyAttackDefinition, AttackTriggerType, AttackEffectType, AttackCategory } from '../types/GameTypes';

export class CsvParser {
  static async parseCsv(filePath: string): Promise<any[]> {
    try {
      const response = await fetch(filePath);
      const text = await response.text();
      return this.parseText(text);
    } catch (error) {
      console.error(`Failed to load CSV from ${filePath}:`, error);
      return [];
    }
  }

  static async parseEnemyAttacks(filePath: string): Promise<Map<string, EnemyAttackDefinition[]>> {
    const rows = await this.parseCsv(filePath);
    const attacksByEnemy = new Map<string, EnemyAttackDefinition[]>();

    for (const row of rows) {
      try {
        const attack = this.parseAttackRow(row);
        const enemyName = row['Enemy Name'];
        
        if (!attacksByEnemy.has(enemyName)) {
          attacksByEnemy.set(enemyName, []);
        }
        attacksByEnemy.get(enemyName)!.push(attack);
      } catch (error) {
        console.error(`Failed to parse attack row:`, row, error);
      }
    }

    return attacksByEnemy;
  }

  private static parseAttackRow(row: any): EnemyAttackDefinition {
    const effectParams = this.parseEffectParams(row['Effect Params']);
    
    return {
      name: row['Attack Name'],
      category: row['Category'] as AttackCategory,
      priorityWeight: parseFloat(row['Priority Weight']) || 0,
      trigger: {
        type: row['Trigger Type'] as AttackTriggerType,
        value: parseFloat(row['Trigger Value']) || 1.0
      },
      maxUses: row['Max Uses'] ? parseInt(row['Max Uses']) : undefined,
      damage: {
        numDice: parseInt(row['Damage Dice']) || 0,
        dieSize: parseInt(row['Damage Die Size']) || 0,
        modifier: parseInt(row['Damage Modifier']) || 0
      },
      effect: {
        type: row['Effect Type'] as AttackEffectType,
        params: effectParams
      },
      description: row['Description'] || ''
    };
  }

  private static parseEffectParams(paramsStr: string): Record<string, any> {
    if (!paramsStr || paramsStr.trim() === '') {
      return {};
    }

    const params: Record<string, any> = {};
    const pairs = paramsStr.split(';');

    for (const pair of pairs) {
      const [key, value] = pair.split('=').map(s => s.trim());
      if (key && value) {
        if (!isNaN(Number(value))) {
          params[key] = Number(value);
        } else {
          params[key] = value;
        }
      }
    }

    return params;
  }

  private static parseText(text: string): any[] {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = this.parseLine(lines[0]);
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i]);
      const row: any = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      rows.push(row);
    }

    return rows;
  }

  private static parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }
}
