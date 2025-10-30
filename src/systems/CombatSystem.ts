import { CombatState, Enemy, PlayerData, AttackResult, WeaponData } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';
import { DiceRoller } from '../utils/DiceRoller';
import { EquipmentManager } from './EquipmentManager';
import { BuffManager } from './BuffManager';
import { ForgingSystem } from './ForgingSystem';

export class CombatSystem {
  private combatState: CombatState | null = null;

  initiateCombat(player: PlayerData, enemies: Enemy[], isWildEncounter: boolean = false): CombatState {
    BuffManager.updateBuffs(player);
    
    this.combatState = {
      player: { ...player },
      enemies: enemies.map(e => ({ ...e })),
      currentTurn: 'player',
      currentEnemyIndex: 0,
      combatLog: ['Combat has begun!'],
      isComplete: false,
      playerVictory: false,
      isWildEncounter,
    };

    return this.combatState;
  }

  playerAttack(targetIndex: number): AttackResult {
    if (!this.combatState || this.combatState.currentTurn !== 'player') {
      return {
        hit: false,
        critical: false,
        attackRoll: 0,
        damage: 0,
        damageBeforeReduction: 0,
        message: 'Not player turn!',
      };
    }

    const target = this.combatState.enemies[targetIndex];
    if (!target || target.health <= 0) {
      return {
        hit: false,
        critical: false,
        attackRoll: 0,
        damage: 0,
        damageBeforeReduction: 0,
        message: 'Invalid target!',
      };
    }

    const staminaCost = GameConfig.COMBAT.STAMINA_COST_PER_ATTACK;
    if (this.combatState.player.stamina < staminaCost) {
      const exhaustionMessage = 'You are exhausted! You must flee combat!';
      this.combatState.combatLog.push(exhaustionMessage);
      this.combatState.isComplete = true;
      this.combatState.playerVictory = false;
      return {
        hit: false,
        critical: false,
        attackRoll: 0,
        damage: 0,
        damageBeforeReduction: 0,
        message: exhaustionMessage,
      };
    }

    this.combatState.player.stamina = Math.max(0, this.combatState.player.stamina - staminaCost);

    const isDualWielding = EquipmentManager.isDualWielding(this.combatState.player);
    
    if (isDualWielding) {
      const weapons = EquipmentManager.getDualWieldWeapons(this.combatState.player);
      if (weapons) {
        this.combatState.combatLog.push(`Dual wielding attack! (-${staminaCost} stamina)`);
        
        const mainHandResult = this.performSingleAttack(target, weapons.mainHand, weapons.mainHandLevel, 'main hand');
        let offHandResult: AttackResult | null = null;
        
        if (target.health > 0) {
          offHandResult = this.performSingleAttack(target, weapons.offHand, weapons.offHandLevel, 'off hand');
        }
        
        if (target.health <= 0) {
          this.combatState.combatLog.push(`${target.name} has been defeated!`);
        }

        this.checkCombatEnd();
        if (!this.combatState.isComplete) {
          this.combatState.currentTurn = 'enemy';
        }

        let combinedMessage = '';
        if (!offHandResult) {
          combinedMessage = mainHandResult.hit 
            ? 'Dual wield: main hand killed enemy before off hand could strike'
            : 'Dual wield: main hand missed, off hand attack skipped (enemy already dead)';
        } else {
          if (mainHandResult.hit && offHandResult.hit) {
            combinedMessage = 'Dual wield: both weapons hit!';
          } else if (mainHandResult.hit) {
            combinedMessage = 'Dual wield: main hand hit, off hand missed';
          } else if (offHandResult.hit) {
            combinedMessage = 'Dual wield: main hand missed, off hand hit';
          } else {
            combinedMessage = 'Dual wield: both attacks missed!';
          }
        }

        const combinedResult: AttackResult = {
          hit: mainHandResult.hit || (offHandResult?.hit || false),
          critical: mainHandResult.critical || (offHandResult?.critical || false),
          attackRoll: Math.max(mainHandResult.attackRoll, offHandResult?.attackRoll || 0),
          damage: mainHandResult.damage + (offHandResult?.damage || 0),
          damageBeforeReduction: mainHandResult.damageBeforeReduction + (offHandResult?.damageBeforeReduction || 0),
          message: combinedMessage,
        };

        return combinedResult;
      }
    }

    return this.performFullAttack(target, staminaCost);
  }

  private performSingleAttack(target: Enemy, weapon: WeaponData, enhancementLevel: number, weaponLabel: string): AttackResult {
    if (!this.combatState) {
      return {
        hit: false,
        critical: false,
        attackRoll: 0,
        damage: 0,
        damageBeforeReduction: 0,
        message: 'No combat state!',
      };
    }

    const attackResult = DiceRoller.rollAttack(this.combatState.player.stats.attackBonus);
    
    const attackRollBonus = BuffManager.getAttackRollBonus(this.combatState.player);
    let finalAttackTotal = attackResult.total;
    let bonusRollText = '';
    
    if (attackRollBonus) {
      const bonusRoll = DiceRoller.rollDiceTotal({ ...attackRollBonus, modifier: 0 });
      finalAttackTotal += bonusRoll.total;
      bonusRollText = ` +${bonusRoll.total} (Cat'riena's Blessing)`;
    }
    
    const hit = finalAttackTotal >= target.evasion;

    if (!hit) {
      const missMessage = `[${weaponLabel}] You swing and miss! (Rolled ${attackResult.d20}+${this.combatState.player.stats.attackBonus}${bonusRollText}=${finalAttackTotal} vs Evasion ${target.evasion})`;
      this.combatState.combatLog.push(missMessage);
      
      return {
        hit: false,
        critical: false,
        attackRoll: attackResult.d20,
        damage: 0,
        damageBeforeReduction: 0,
        message: missMessage,
      };
    }

    const weaponDamage = ForgingSystem.calculateEnhancedDamage(weapon, enhancementLevel);
    let damageBeforeReduction: number;
    let damageRollInfo: string;
    
    const buffDamageBonus = BuffManager.getDamageBonus(this.combatState.player);

    if (attackResult.critical) {
      const critResult = DiceRoller.rollCriticalDamage(weaponDamage);
      damageBeforeReduction = critResult.total + buffDamageBonus;
      const buffText = buffDamageBonus > 0 ? ` +${buffDamageBonus} (Enraged Spirit)` : '';
      damageRollInfo = `CRITICAL HIT! (${critResult.maxDie} max + ${critResult.extraRoll} roll + ${critResult.modifier}${buffText} = ${damageBeforeReduction})`;
    } else {
      const damageResult = DiceRoller.rollDiceTotal(weaponDamage);
      damageBeforeReduction = damageResult.total + buffDamageBonus;
      const rollsStr = damageResult.rolls.join('+');
      const buffText = buffDamageBonus > 0 ? `+${buffDamageBonus}` : '';
      damageRollInfo = `(${rollsStr}+${damageResult.modifier}${buffText ? '+' + buffText : ''} = ${damageBeforeReduction})`;
    }

    const damageReduction = target.damageReduction;
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - damageReduction)));

    target.health = Math.max(0, target.health - damage);
    
    let logMessage = `[${weaponLabel}] You hit ${target.name}! ${damageRollInfo}`;
    if (damageReduction > 0) {
      logMessage += ` -> ${damage} damage after ${Math.floor(damageReduction * 100)}% reduction`;
    } else {
      logMessage += ` -> ${damage} damage`;
    }
    
    this.combatState.combatLog.push(logMessage);

    return {
      hit: true,
      critical: attackResult.critical,
      attackRoll: attackResult.d20,
      damage,
      damageBeforeReduction,
      message: logMessage,
    };
  }

  private performFullAttack(target: Enemy, staminaCost: number): AttackResult {
    if (!this.combatState) {
      return {
        hit: false,
        critical: false,
        attackRoll: 0,
        damage: 0,
        damageBeforeReduction: 0,
        message: 'No combat state!',
      };
    }

    const attackResult = DiceRoller.rollAttack(this.combatState.player.stats.attackBonus);
    
    const attackRollBonus = BuffManager.getAttackRollBonus(this.combatState.player);
    let finalAttackTotal = attackResult.total;
    let bonusRollText = '';
    
    if (attackRollBonus) {
      const bonusRoll = DiceRoller.rollDiceTotal({ ...attackRollBonus, modifier: 0 });
      finalAttackTotal += bonusRoll.total;
      bonusRollText = ` +${bonusRoll.total} (Cat'riena's Blessing)`;
    }
    
    const hit = finalAttackTotal >= target.evasion;

    if (!hit) {
      const missMessage = `You swing and miss! (Rolled ${attackResult.d20}+${this.combatState.player.stats.attackBonus}${bonusRollText}=${finalAttackTotal} vs Evasion ${target.evasion}) (-${staminaCost} stamina)`;
      this.combatState.combatLog.push(missMessage);
      
      this.checkCombatEnd();
      if (!this.combatState.isComplete) {
        this.combatState.currentTurn = 'enemy';
      }
      
      return {
        hit: false,
        critical: false,
        attackRoll: attackResult.d20,
        damage: 0,
        damageBeforeReduction: 0,
        message: missMessage,
      };
    }

    const weaponWithEnhancement = EquipmentManager.getEquippedWeaponWithEnhancement(this.combatState.player);
    const weaponDamage = weaponWithEnhancement 
      ? ForgingSystem.calculateEnhancedDamage(weaponWithEnhancement.weapon, weaponWithEnhancement.enhancementLevel)
      : { numDice: 1, dieSize: 4, modifier: this.combatState.player.stats.damageBonus };

    let damageBeforeReduction: number;
    let damageRollInfo: string;
    
    const buffDamageBonus = BuffManager.getDamageBonus(this.combatState.player);

    if (attackResult.critical) {
      const critResult = DiceRoller.rollCriticalDamage(weaponDamage);
      damageBeforeReduction = critResult.total + buffDamageBonus;
      const buffText = buffDamageBonus > 0 ? ` +${buffDamageBonus} (Enraged Spirit)` : '';
      damageRollInfo = `CRITICAL HIT! (${critResult.maxDie} max + ${critResult.extraRoll} roll + ${critResult.modifier}${buffText} = ${damageBeforeReduction})`;
    } else {
      const damageResult = DiceRoller.rollDiceTotal(weaponDamage);
      damageBeforeReduction = damageResult.total + buffDamageBonus;
      const rollsStr = damageResult.rolls.join('+');
      const buffText = buffDamageBonus > 0 ? `+${buffDamageBonus}` : '';
      damageRollInfo = `(${rollsStr}+${damageResult.modifier}${buffText ? '+' + buffText : ''} = ${damageBeforeReduction})`;
    }

    const damageReduction = target.damageReduction;
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - damageReduction)));

    target.health = Math.max(0, target.health - damage);
    
    let logMessage = `You hit ${target.name}! ${damageRollInfo}`;
    if (damageReduction > 0) {
      logMessage += ` -> ${damage} damage after ${Math.floor(damageReduction * 100)}% reduction`;
    } else {
      logMessage += ` -> ${damage} damage`;
    }
    logMessage += ` (-${staminaCost} stamina)`;
    
    this.combatState.combatLog.push(logMessage);

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.checkCombatEnd();

    if (!this.combatState.isComplete) {
      this.combatState.currentTurn = 'enemy';
    }

    return {
      hit: true,
      critical: attackResult.critical,
      attackRoll: attackResult.d20,
      damage,
      damageBeforeReduction,
      message: logMessage,
    };
  }

  enemyTurn(): string[] {
    if (!this.combatState || this.combatState.currentTurn !== 'enemy') {
      return ['Not enemy turn!'];
    }

    const logs: string[] = [];
    const aliveEnemies = this.combatState.enemies.filter(e => e.health > 0);

    for (const enemy of aliveEnemies) {
      const attackResult = DiceRoller.rollAttack(3);
      const hit = attackResult.total >= this.combatState.player.stats.calculatedEvasion;

      if (!hit) {
        const missMessage = `${enemy.name} swings and misses! (Rolled ${attackResult.d20}+3=${attackResult.total} vs Evasion ${this.combatState.player.stats.calculatedEvasion})`;
        this.combatState.combatLog.push(missMessage);
        logs.push(missMessage);
        continue;
      }

      let damageBeforeReduction: number;
      let damageRollInfo: string;

      if (attackResult.critical) {
        const critResult = DiceRoller.rollCriticalDamage(enemy.weaponDamage);
        damageBeforeReduction = critResult.total;
        damageRollInfo = `CRITICAL HIT! (${critResult.maxDie} max + ${critResult.extraRoll} roll + ${critResult.modifier} = ${critResult.total})`;
      } else {
        const damageResult = DiceRoller.rollDiceTotal(enemy.weaponDamage);
        damageBeforeReduction = damageResult.total;
        const rollsStr = damageResult.rolls.join('+');
        damageRollInfo = `(${rollsStr}+${damageResult.modifier} = ${damageResult.total})`;
      }

      const damageReduction = this.combatState.player.stats.damageReduction;
      const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - damageReduction)));

      this.combatState.player.health = Math.max(
        0,
        this.combatState.player.health - damage
      );

      let logMessage = `${enemy.name} hits you! ${damageRollInfo}`;
      if (damageReduction > 0) {
        logMessage += ` -> ${damage} damage after ${Math.floor(damageReduction * 100)}% reduction`;
      } else {
        logMessage += ` -> ${damage} damage`;
      }
      
      this.combatState.combatLog.push(logMessage);
      logs.push(logMessage);
    }

    this.checkCombatEnd();

    if (!this.combatState.isComplete) {
      this.combatState.currentTurn = 'player';
    }

    return logs;
  }

  private checkCombatEnd(): void {
    if (!this.combatState) return;

    const allEnemiesDead = this.combatState.enemies.every(e => e.health <= 0);
    const playerDead = this.combatState.player.health <= 0;
    const playerExhausted = this.combatState.player.stamina <= 0;

    if (allEnemiesDead) {
      this.combatState.isComplete = true;
      this.combatState.playerVictory = true;
      this.combatState.combatLog.push('Victory! All enemies defeated!');
    } else if (playerDead) {
      this.combatState.isComplete = true;
      this.combatState.playerVictory = false;
      this.combatState.combatLog.push('You have been defeated...');
    } else if (playerExhausted) {
      this.combatState.isComplete = true;
      this.combatState.playerVictory = false;
      this.combatState.combatLog.push('You are too exhausted to continue fighting and must flee!');
    }
  }

  getCombatState(): CombatState | null {
    return this.combatState;
  }

  isPlayerTurn(): boolean {
    return this.combatState?.currentTurn === 'player' && !this.combatState.isComplete;
  }

  isCombatComplete(): boolean {
    return this.combatState?.isComplete || false;
  }

  endCombat(): void {
    this.combatState = null;
  }
}
