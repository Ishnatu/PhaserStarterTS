import { CombatState, Enemy, PlayerData } from '../types/GameTypes';

export class CombatSystem {
  private combatState: CombatState | null = null;

  initiateCombat(player: PlayerData, enemies: Enemy[]): CombatState {
    this.combatState = {
      player: { ...player },
      enemies: enemies.map(e => ({ ...e })),
      currentTurn: 'player',
      currentEnemyIndex: 0,
      combatLog: ['Combat has begun!'],
      isComplete: false,
      playerVictory: false,
    };

    return this.combatState;
  }

  playerAttack(targetIndex: number): string {
    if (!this.combatState || this.combatState.currentTurn !== 'player') {
      return 'Not player turn!';
    }

    const target = this.combatState.enemies[targetIndex];
    if (!target || target.health <= 0) {
      return 'Invalid target!';
    }

    const damage = Math.max(1, this.calculateDamage(
      this.combatState.player,
      target
    ));

    target.health = Math.max(0, target.health - damage);
    
    const logMessage = `You dealt ${damage} damage to ${target.name}!`;
    this.combatState.combatLog.push(logMessage);

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.checkCombatEnd();

    if (!this.combatState.isComplete) {
      this.combatState.currentTurn = 'enemy';
    }

    return logMessage;
  }

  enemyTurn(): string[] {
    if (!this.combatState || this.combatState.currentTurn !== 'enemy') {
      return ['Not enemy turn!'];
    }

    const logs: string[] = [];
    const aliveEnemies = this.combatState.enemies.filter(e => e.health > 0);

    for (const enemy of aliveEnemies) {
      const damage = Math.max(1, this.calculateDamage(
        enemy,
        this.combatState.player
      ));

      this.combatState.player.health = Math.max(
        0,
        this.combatState.player.health - damage
      );

      const logMessage = `${enemy.name} dealt ${damage} damage to you!`;
      this.combatState.combatLog.push(logMessage);
      logs.push(logMessage);
    }

    this.checkCombatEnd();

    if (!this.combatState.isComplete) {
      this.combatState.currentTurn = 'player';
    }

    return logs;
  }

  private calculateDamage(attacker: any, defender: any): number {
    const baseAttack = attacker.attack || 10;
    const defense = defender.defense || 5;
    
    const variance = 0.8 + Math.random() * 0.4;
    const damage = Math.floor((baseAttack - defense * 0.5) * variance);
    
    return Math.max(1, damage);
  }

  private checkCombatEnd(): void {
    if (!this.combatState) return;

    const allEnemiesDead = this.combatState.enemies.every(e => e.health <= 0);
    const playerDead = this.combatState.player.health <= 0;

    if (allEnemiesDead) {
      this.combatState.isComplete = true;
      this.combatState.playerVictory = true;
      this.combatState.combatLog.push('Victory! All enemies defeated!');
    } else if (playerDead) {
      this.combatState.isComplete = true;
      this.combatState.playerVictory = false;
      this.combatState.combatLog.push('You have been defeated...');
    }
  }

  getCombatState(): CombatState | null {
    return this.combatState;
  }

  isPlayerTurn(): boolean {
    return this.combatState?.currentTurn === 'player' || false;
  }

  isCombatComplete(): boolean {
    return this.combatState?.isComplete || false;
  }
}
