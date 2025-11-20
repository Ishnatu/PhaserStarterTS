import { CombatState, Enemy, PlayerData, AttackResult, WeaponData, WeaponAttack, DiceRoll } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';
import { DiceRoller } from '../utils/DiceRoller';
import { EquipmentManager } from './EquipmentManager';
import { BuffManager } from './BuffManager';
import { ForgingSystem } from './ForgingSystem';
import { ConditionManager } from './ConditionManager';
import { WeaponAttackDatabase } from '../config/WeaponAttackDatabase';
import { ItemDatabase } from '../config/ItemDatabase';

export class CombatSystem {
  private combatState: CombatState | null = null;

  initiateCombat(player: PlayerData, enemies: Enemy[], isWildEncounter: boolean = false): CombatState {
    BuffManager.updateBuffs(player);
    
    if (!player.statusConditions) {
      player.statusConditions = [];
    }
    
    this.combatState = {
      player: { ...player, statusConditions: [...(player.statusConditions || [])] },
      enemies: enemies.map(e => ({ 
        ...e, 
        statusConditions: e.statusConditions || [],
        backstabUsed: false,
        chronostepUsesRemaining: e.name === 'Greater Void Spawn' ? 2 : undefined,
        damageReceivedHistory: e.name === 'Greater Void Spawn' ? [] : undefined,
        itemStolen: e.name === 'Crawley Crow' ? false : undefined
      })),
      currentTurn: 'player',
      currentEnemyIndex: 0,
      combatLog: ['Combat has begun!'],
      isComplete: false,
      playerVictory: false,
      isWildEncounter,
      actionsRemaining: 2,
      maxActionsPerTurn: 2,
      currentRound: 0,
    };

    return this.combatState;
  }

  playerTurnStart(): void {
    if (!this.combatState) return;

    const isSlowed = ConditionManager.hasCondition(this.combatState.player, 'slowed');
    this.combatState.actionsRemaining = isSlowed ? 1 : this.combatState.maxActionsPerTurn;

    if (ConditionManager.isStunned(this.combatState.player)) {
      this.combatState.combatLog.push('You are stunned and cannot act!');
      ConditionManager.tickConditions(this.combatState.player);
      this.combatState.currentTurn = 'enemy';
      return;
    }
    
    if (isSlowed) {
      this.combatState.combatLog.push('You are slowed! Only 1 action this turn.');
    }

    const tickResult = ConditionManager.tickConditions(this.combatState.player);
    if (tickResult.damage > 0) {
      this.combatState.player.health = Math.max(0, this.combatState.player.health - tickResult.damage);
      tickResult.messages.forEach(msg => this.combatState!.combatLog.push(`[Player] ${msg}`));
      
      if (this.combatState.player.health <= 0) {
        this.combatState.combatLog.push('You succumbed to your conditions...');
        this.checkCombatEnd();
      }
    }
  }

  playerAttack(targetIndex: number, attack: WeaponAttack): AttackResult {
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

    if (ConditionManager.isStunned(this.combatState.player)) {
      return {
        hit: false,
        critical: false,
        attackRoll: 0,
        damage: 0,
        damageBeforeReduction: 0,
        message: 'You are stunned and cannot attack!',
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

    if (this.combatState.player.stamina < attack.staminaCost) {
      return {
        hit: false,
        critical: false,
        attackRoll: 0,
        damage: 0,
        damageBeforeReduction: 0,
        message: 'Not enough stamina to attack!',
      };
    }

    this.combatState.player.stamina = Math.max(0, this.combatState.player.stamina - attack.staminaCost);

    return this.executeAttack(targetIndex, attack);
  }


  private executeAttack(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];

    if (attack.weaponData && attack.enhancementLevel !== undefined && attack.sourceHand) {
      const weaponLabel = attack.sourceHand === 'mainHand' ? 'main hand' : 'off hand';
      return this.executeAttackWithSpecifiedWeapon(targetIndex, attack, attack.weaponData, attack.enhancementLevel, weaponLabel);
    }

    if (attack.name === 'Backstab') {
      if (target.backstabUsed && !ConditionManager.isStunned(target)) {
        return this.createFailedAttack('Backstab already used on this target (unless stunned)!');
      }
    }

    if (attack.name === 'Puncture') {
      return this.executePuncture(targetIndex, attack);
    }

    if (attack.name === 'Vipers Fangs') {
      return this.executeVipersFangs(targetIndex, attack);
    }

    if (attack.name === 'Arcing Blade') {
      return this.executeArcingBlade(attack);
    }

    if (attack.name === 'Spinning Flurry') {
      return this.executeSpinningFlurry(attack);
    }

    if (attack.name === 'Murderous Intent') {
      return this.executeMurderousIntent(targetIndex, attack);
    }

    if (attack.name === 'Crimson Mist') {
      return this.executeCrimsonMist(targetIndex, attack);
    }

    if (attack.name === 'Bloodfury') {
      return this.executeBloodfury(targetIndex, attack);
    }

    if (attack.name === 'Savage Strike') {
      return this.executeSavageStrike(targetIndex, attack);
    }

    if (attack.name === 'Shield Wall' || attack.name === 'Shield Slam') {
      return this.executeShieldAbility(targetIndex, attack);
    }

    if (attack.name === 'Disarming Strike' || attack.name === 'Guarding Strike' || 
        attack.name === 'Roll' || attack.name === 'Dust Up') {
      return this.executeDefensiveBuff(targetIndex, attack);
    }

    return this.executeStandardAttack(targetIndex, attack);
  }

  private executeAttackWithSpecifiedWeapon(
    targetIndex: number,
    attack: WeaponAttack,
    weapon: WeaponData,
    enhancementLevel: number,
    weaponLabel: string
  ): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];

    if (attack.name === 'Backstab') {
      if (target.backstabUsed && !ConditionManager.isStunned(target)) {
        return this.createFailedAttack('Backstab already used on this target (unless stunned)!');
      }
    }

    const baseDamage = ForgingSystem.calculateEnhancedDamage(weapon, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    const attackResult = this.rollAttackWithBonus(critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `[${weaponLabel}] You swing and miss! (-${attack.staminaCost} stamina)`;
      this.combatState.combatLog.push(missMessage);
      this.deductActions(attack.actionCost);
      this.checkAndEndPlayerTurn();
      return this.createFailedAttack(missMessage, attackResult.d20);
    }

    const { damage, damageBeforeReduction, damageRollInfo } = this.calculateDamage(
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(target, damage);
    
    let logMessage = `[${weaponLabel}] You hit ${target.name} with ${attack.name}! ${damageRollInfo} -> ${damage} damage (-${attack.staminaCost} stamina)`;
    this.combatState.combatLog.push(logMessage);

    this.applyConditionFromAttack(target, attack);

    if (attack.name === 'Backstab' && attackResult.critical) {
      target.backstabUsed = true;
    }

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    if (attack.cleave && attack.cleave > 0) {
      this.applyCleave(targetIndex, damage, attack.cleave, attack.name);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: true,
      critical: attackResult.critical,
      attackRoll: attackResult.d20,
      damage,
      damageBeforeReduction,
      message: logMessage,
    };
  }

  private executeStandardAttack(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];
    const weaponWithEnhancement = EquipmentManager.getEquippedWeaponWithEnhancement(this.combatState.player);
    
    if (!weaponWithEnhancement) {
      return this.createFailedAttack('No weapon equipped!');
    }

    const baseDamage = ForgingSystem.calculateEnhancedDamage(
      weaponWithEnhancement.weapon,
      weaponWithEnhancement.enhancementLevel
    );
    
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    const attackResult = this.rollAttackWithBonus(critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `You swing and miss! (-${attack.staminaCost} stamina)`;
      this.combatState.combatLog.push(missMessage);
      this.deductActions(attack.actionCost);
      this.checkAndEndPlayerTurn();
      return this.createFailedAttack(missMessage, attackResult.d20);
    }

    const { damage, damageBeforeReduction, damageRollInfo } = this.calculateDamage(
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(target, damage);
    
    let logMessage = `You hit ${target.name} with ${attack.name}! ${damageRollInfo} -> ${damage} damage (-${attack.staminaCost} stamina)`;
    this.combatState.combatLog.push(logMessage);

    this.applyConditionFromAttack(target, attack);

    if (attack.name === 'Backstab' && attackResult.critical) {
      target.backstabUsed = true;
    }

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    if (attack.cleave && attack.cleave > 0) {
      this.applyCleave(targetIndex, damage, attack.cleave, attack.name);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: true,
      critical: attackResult.critical,
      attackRoll: attackResult.d20,
      damage,
      damageBeforeReduction,
      message: logMessage,
    };
  }

  private executePuncture(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    this.combatState.combatLog.push(`Executing Puncture - 3 consecutive attacks!`);
    
    let totalDamage = 0;
    let totalDamageBeforeReduction = 0;
    let anyHit = false;
    let anyCrit = false;
    let attackRoll = 0;

    for (let i = 0; i < 3; i++) {
      const target = this.combatState.enemies[targetIndex];
      if (!target) break;

      const result = this.executeSingleStrike(target, attack, `Puncture strike ${i + 1}`);
      anyHit = anyHit || result.hit;
      anyCrit = anyCrit || result.critical;
      attackRoll = Math.max(attackRoll, result.attackRoll);
      totalDamage += result.damage;
      totalDamageBeforeReduction += result.damageBeforeReduction;

      if (target.health <= 0 && i === 0) {
        this.combatState.combatLog.push(`${target.name} has been defeated!`);
      }
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: anyHit,
      critical: anyCrit,
      attackRoll,
      damage: totalDamage,
      damageBeforeReduction: totalDamageBeforeReduction,
      message: `Puncture complete! Total: ${totalDamage} damage`,
    };
  }

  private executeVipersFangs(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];
    const firstStrike = this.executeSingleStrike(target, attack, 'Vipers Fangs first strike');

    if (firstStrike.hit && target.health > 0) {
      this.combatState.combatLog.push('Second strike triggered!');
      const secondStrike = this.executeSingleStrike(target, attack, 'Vipers Fangs second strike');
      
      if (target.health <= 0) {
        this.combatState.combatLog.push(`${target.name} has been defeated!`);
      }

      this.deductActions(attack.actionCost);
      this.checkCombatEnd();
      this.checkAndEndPlayerTurn();

      const totalDamage = firstStrike.damage + secondStrike.damage;
      let resultMessage: string;
      
      if (secondStrike.hit) {
        resultMessage = `Vipers Fangs: Both strikes connected for ${totalDamage} total damage`;
      } else {
        resultMessage = `Vipers Fangs: First strike hit for ${firstStrike.damage} damage, second strike missed`;
      }

      return {
        hit: true,
        critical: firstStrike.critical || secondStrike.critical,
        attackRoll: Math.max(firstStrike.attackRoll, secondStrike.attackRoll),
        damage: totalDamage,
        damageBeforeReduction: firstStrike.damageBeforeReduction + secondStrike.damageBeforeReduction,
        message: resultMessage,
      };
    }

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();
    return firstStrike;
  }

  private executeSweepingStrike(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const primaryTarget = this.combatState.enemies[targetIndex];
    const primaryResult = this.executeSingleStrike(primaryTarget, attack, 'Sweeping Strike (primary)');

    const otherEnemies = this.combatState.enemies.filter((e, i) => i !== targetIndex && e.health > 0);
    
    if (otherEnemies.length > 0 && primaryResult.hit) {
      const cleaveDamage = Math.floor(primaryResult.damage * 0.75);
      this.combatState.combatLog.push(`Cleaving momentum strikes ${otherEnemies.length} adjacent enemies for ${cleaveDamage} damage each!`);
      
      for (const enemy of otherEnemies) {
        enemy.health = Math.max(0, enemy.health - cleaveDamage);
        this.trackDamageToEnemy(enemy, cleaveDamage);
        this.combatState.combatLog.push(`${enemy.name} takes ${cleaveDamage} cleave damage`);
        
        if (enemy.health <= 0) {
          this.combatState.combatLog.push(`${enemy.name} has been defeated!`);
        }
      }
    }

    if (primaryTarget.health <= 0) {
      this.combatState.combatLog.push(`${primaryTarget.name} has been defeated!`);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();
    return primaryResult;
  }

  private executeArcingBlade(attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    this.combatState.combatLog.push('Arcing Blade strikes all enemies!');
    
    let totalDamage = 0;
    let anyHit = false;
    let anyCrit = false;
    let attackRoll = 0;

    for (const enemy of this.combatState.enemies) {
      if (enemy.health <= 0) continue;

      const result = this.executeSingleStrike(enemy, attack, `Arcing Blade on ${enemy.name}`);
      anyHit = anyHit || result.hit;
      anyCrit = anyCrit || result.critical;
      attackRoll = Math.max(attackRoll, result.attackRoll);
      totalDamage += result.damage;

      if (enemy.health <= 0) {
        this.combatState.combatLog.push(`${enemy.name} has been defeated!`);
      }
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: anyHit,
      critical: anyCrit,
      attackRoll,
      damage: totalDamage,
      damageBeforeReduction: totalDamage,
      message: `Arcing Blade complete! Total: ${totalDamage} damage across all enemies`,
    };
  }

  private executeSpinningFlurry(attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    this.combatState.combatLog.push('Spinning Flurry - 3 sweeping strikes to all enemies!');
    
    let totalDamage = 0;
    let anyHit = false;
    let anyCrit = false;
    let attackRoll = 0;
    let totalHits = 0;

    for (let sweep = 0; sweep < 3; sweep++) {
      this.combatState.combatLog.push(`Sweep ${sweep + 1}:`);
      
      for (const enemy of this.combatState.enemies) {
        if (enemy.health <= 0) continue;

        const result = this.executeSingleStrike(enemy, attack, `Sweep ${sweep + 1} on ${enemy.name}`);
        anyHit = anyHit || result.hit;
        anyCrit = anyCrit || result.critical;
        attackRoll = Math.max(attackRoll, result.attackRoll);
        totalDamage += result.damage;
        
        if (result.hit) {
          totalHits++;
        }

        if (enemy.health <= 0) {
          this.combatState.combatLog.push(`${enemy.name} has been defeated!`);
        }
      }
    }
    
    if (totalHits >= 2) {
      ConditionManager.applyCondition(this.combatState.player, 'raise_evasion', 2, 1);
      this.combatState.combatLog.push(`Spinning Flurry momentum! Evasion raised by +3 for 2 rounds!`);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: anyHit,
      critical: anyCrit,
      attackRoll,
      damage: totalDamage,
      damageBeforeReduction: totalDamage,
      message: `Spinning Flurry complete! Total: ${totalDamage} damage`,
    };
  }

  private executeMurderousIntent(targetIndex: number, attack: WeaponAttack): AttackResult{
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const primaryTarget = this.combatState.enemies[targetIndex];
    this.combatState.combatLog.push(`Murderous Intent - savage strike on ${primaryTarget.name}!`);
    
    const primaryResult = this.executeSingleStrike(primaryTarget, attack, 'Murderous Intent (primary)');
    let totalDamage = primaryResult.damage;
    let enemyKilled = primaryTarget.health <= 0;

    if (enemyKilled) {
      this.combatState.combatLog.push(`${primaryTarget.name} has been defeated!`);
    }

    if (primaryResult.hit && attack.cleave) {
      const enemiesBeforeCleave = this.combatState.enemies.filter(e => e.health > 0).length;
      const cleaveDamage = Math.floor(primaryResult.damage * attack.cleave);
      const otherEnemies = this.combatState.enemies.filter((e, i) => i !== targetIndex && e.health > 0);
      
      if (otherEnemies.length > 0) {
        this.applyCleave(targetIndex, primaryResult.damage, attack.cleave, attack.name);
        totalDamage += cleaveDamage * otherEnemies.length;
      }
      
      const enemiesAfterCleave = this.combatState.enemies.filter(e => e.health > 0).length;
      if (enemiesAfterCleave < enemiesBeforeCleave) {
        enemyKilled = true;
      }
    }

    if (enemyKilled) {
      const procChance = Math.random() * 100;
      if (procChance < 20) {
        const remainingEnemies = this.combatState.enemies.filter(e => e.health > 0);
        if (remainingEnemies.length > 0) {
          const randomEnemy = remainingEnemies[Math.floor(Math.random() * remainingEnemies.length)];
          this.combatState.combatLog.push(`Murderous Intent procs! Bonus Savage Strike on ${randomEnemy.name} (no stamina cost)!`);
          
          const bonusResult = this.executeSingleStrike(randomEnemy, attack, 'Bonus Savage Strike');
          totalDamage += bonusResult.damage;

          if (randomEnemy.health <= 0) {
            this.combatState.combatLog.push(`${randomEnemy.name} has been defeated!`);
          }
        }
      }
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: primaryResult.hit,
      critical: primaryResult.critical,
      attackRoll: primaryResult.attackRoll,
      damage: totalDamage,
      damageBeforeReduction: totalDamage,
      message: `Murderous Intent complete! Total: ${totalDamage} damage`,
    };
  }

  private executeCrimsonMist(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];
    const weaponWithEnhancement = EquipmentManager.getEquippedWeaponWithEnhancement(this.combatState.player);
    
    if (!weaponWithEnhancement) {
      return this.createFailedAttack('No weapon equipped!');
    }

    const baseDamage = ForgingSystem.calculateEnhancedDamage(
      weaponWithEnhancement.weapon,
      weaponWithEnhancement.enhancementLevel
    );
    
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const attackResult = this.rollAttackWithBonus(18);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `Crimson Mist misses! (-${attack.staminaCost} stamina)`;
      this.combatState.combatLog.push(missMessage);
      this.deductActions(attack.actionCost);
      this.checkAndEndPlayerTurn();
      return this.createFailedAttack(missMessage, attackResult.d20);
    }

    const { damage, damageBeforeReduction, damageRollInfo } = this.calculateDamage(
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(target, damage);
    
    let logMessage = `Crimson Mist strikes ${target.name}! ${damageRollInfo} -> ${damage} damage`;
    this.combatState.combatLog.push(logMessage);

    if (attackResult.critical && target.health < target.maxHealth * 0.30 && target.health > 0) {
      if (Math.random() < 0.35) {
        target.health = 0;
        this.combatState.combatLog.push(`DECAPITATION! ${target.name} is instantly killed!`);
      }
    }

    this.applyConditionFromAttack(target, attack);

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: true,
      critical: attackResult.critical,
      attackRoll: attackResult.d20,
      damage,
      damageBeforeReduction,
      message: logMessage,
    };
  }

  private executeBloodfury(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];
    const result = this.executeStandardAttack(targetIndex, attack);

    if (result.hit && ConditionManager.hasCondition(target, 'bleeding')) {
      const healAmount = Math.floor(result.damage * 0.5);
      this.combatState.player.health = Math.min(
        this.combatState.player.maxHealth,
        this.combatState.player.health + healAmount
      );
      this.combatState.combatLog.push(`Bloodfury: Healed ${healAmount} HP from bleeding target!`);
    }

    return result;
  }

  private executeSavageStrike(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];
    const weaponWithEnhancement = EquipmentManager.getEquippedWeaponWithEnhancement(this.combatState.player);
    
    if (!weaponWithEnhancement) {
      return this.createFailedAttack('No weapon equipped!');
    }

    const baseDamage = ForgingSystem.calculateEnhancedDamage(
      weaponWithEnhancement.weapon,
      weaponWithEnhancement.enhancementLevel
    );
    
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const attackResult = this.rollAttackWithBonus(19);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `Savage Strike misses! (-${attack.staminaCost} stamina)`;
      this.combatState.combatLog.push(missMessage);
      this.deductActions(attack.actionCost);
      this.checkAndEndPlayerTurn();
      return this.createFailedAttack(missMessage, attackResult.d20);
    }

    let { damage, damageBeforeReduction, damageRollInfo } = this.calculateDamage(
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    if (attackResult.critical) {
      const numDice = baseDamage.numDice;
      const bonusDamageRoll = DiceRoller.rollDiceTotal({ numDice, dieSize: 12, modifier: 0 });
      const bonusDamage = bonusDamageRoll.total;
      damage += bonusDamage;
      damageBeforeReduction += bonusDamage;
      this.combatState.combatLog.push(`Savage Strike critical! Rolling ${numDice}d12 bonus damage: ${bonusDamage}`);
      damageRollInfo += ` + ${bonusDamage} bonus`;
    }

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(target, damage);
    
    let logMessage = `Savage Strike hits ${target.name}! ${damageRollInfo} -> ${damage} damage`;
    this.combatState.combatLog.push(logMessage);

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: true,
      critical: attackResult.critical,
      attackRoll: attackResult.d20,
      damage,
      damageBeforeReduction,
      message: logMessage,
    };
  }

  private executeShieldAbility(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const shieldItem = this.combatState.player.equipment.offHand;
    const shieldLevel = shieldItem?.enhancementLevel || 0;
    const absorbAmount = Math.floor(10 * (shieldLevel / 2));

    this.combatState.combatLog.push(`${attack.name}: Absorbing ${absorbAmount} damage this turn!`);
    ConditionManager.applyCondition(this.combatState.player, 'raise_defence', 1, absorbAmount);

    if (attack.name === 'Shield Slam') {
      const target = this.combatState.enemies[targetIndex];
      const result = this.executeSingleStrike(target, attack, 'Shield Slam');
      
      if (target.health <= 0) {
        this.combatState.combatLog.push(`${target.name} has been defeated!`);
      }

      this.deductActions(attack.actionCost);
      this.checkCombatEnd();
      this.checkAndEndPlayerTurn();
      return result;
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();

    return {
      hit: true,
      critical: false,
      attackRoll: 0,
      damage: 0,
      damageBeforeReduction: 0,
      message: `${attack.name} activated! Absorbing ${absorbAmount} damage`,
    };
  }

  private executeDefensiveBuff(targetIndex: number, attack: WeaponAttack): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const target = this.combatState.enemies[targetIndex];

    if (attack.name === 'Disarming Strike') {
      ConditionManager.applyCondition(this.combatState.player, 'raise_evasion', 1, 3);
      ConditionManager.applyCondition(this.combatState.player, 'raise_defence', 1, 10);
      this.combatState.combatLog.push('Disarming Strike: +3 evasion, +10% DR for 1 turn!');
    } else if (attack.name === 'Guarding Strike') {
      ConditionManager.applyCondition(this.combatState.player, 'raise_evasion', 1, 5);
      this.combatState.combatLog.push('Guarding Strike: +5 evasion for 1 turn!');
    } else if (attack.name === 'Roll') {
      ConditionManager.applyCondition(this.combatState.player, 'raise_evasion', 1, 3);
      this.combatState.combatLog.push('Roll: +3 evasion for 1 turn!');
    } else if (attack.name === 'Dust Up') {
      ConditionManager.applyCondition(this.combatState.player, 'raise_evasion', 1, 5);
      ConditionManager.applyCondition(this.combatState.player, 'raise_defence', 1, 15);
      this.combatState.combatLog.push('Dust Up: +5 evasion, +15% DR for 1 turn!');
    }

    const result = this.executeSingleStrike(target, attack, attack.name);

    if (target.health <= 0) {
      this.combatState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(attack.actionCost);
    this.checkCombatEnd();
    this.checkAndEndPlayerTurn();
    return result;
  }

  private executeSingleStrike(target: Enemy, attack: WeaponAttack, label: string): AttackResult {
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    const weaponWithEnhancement = EquipmentManager.getEquippedWeaponWithEnhancement(this.combatState.player);
    
    if (!weaponWithEnhancement) {
      return this.createFailedAttack('No weapon equipped!');
    }

    const baseDamage = ForgingSystem.calculateEnhancedDamage(
      weaponWithEnhancement.weapon,
      weaponWithEnhancement.enhancementLevel
    );
    
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    const attackResult = this.rollAttackWithBonus(critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      this.combatState.combatLog.push(`${label}: Miss!`);
      return this.createFailedAttack(`${label}: Miss!`, attackResult.d20);
    }

    const { damage, damageBeforeReduction, damageRollInfo } = this.calculateDamage(
      multipliedDamage,
      attackResult.critical,
      target,
      label
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(target, damage);
    this.combatState.combatLog.push(`${label}: ${damage} damage to ${target.name}`);

    this.applyConditionFromAttack(target, attack);

    return {
      hit: true,
      critical: attackResult.critical,
      attackRoll: attackResult.d20,
      damage,
      damageBeforeReduction,
      message: `${label}: ${damage} damage`,
    };
  }

  private applyCleave(primaryTargetIndex: number, primaryDamage: number, cleavePercent: number, attackName: string): void {
    if (!this.combatState) return;

    const cleaveDamage = Math.floor(primaryDamage * cleavePercent);
    const otherEnemies = this.combatState.enemies.filter((e, i) => i !== primaryTargetIndex && e.health > 0);

    console.log(`[CLEAVE DEBUG] Primary target index: ${primaryTargetIndex}, Primary damage: ${primaryDamage}, Cleave %: ${cleavePercent}`);
    console.log(`[CLEAVE DEBUG] Total enemies: ${this.combatState.enemies.length}, Other living enemies: ${otherEnemies.length}`);
    console.log(`[CLEAVE DEBUG] Cleave damage to apply: ${cleaveDamage}`);

    if (otherEnemies.length === 0) {
      console.log(`[CLEAVE DEBUG] No other enemies to cleave!`);
      return;
    }

    this.combatState.combatLog.push(`Cleaving momentum strikes ${otherEnemies.length} other enemies for ${cleaveDamage} damage each!`);

    for (const enemy of otherEnemies) {
      const beforeHP = enemy.health;
      enemy.health = Math.max(0, enemy.health - cleaveDamage);
      this.trackDamageToEnemy(enemy, cleaveDamage);
      console.log(`[CLEAVE DEBUG] ${enemy.name}: ${beforeHP} -> ${enemy.health} HP`);
      this.combatState.combatLog.push(`${enemy.name} takes ${cleaveDamage} cleave damage`);

      if (enemy.health <= 0) {
        this.combatState.combatLog.push(`${enemy.name} has been defeated!`);
      }
    }
  }

  private applyDamageMultiplier(baseDamage: DiceRoll, multiplier: number): DiceRoll {
    let adjustedMultiplier = multiplier;
    
    if (this.combatState) {
      const dependableCondition = ConditionManager.getCondition(this.combatState.player, 'dependable');
      if (dependableCondition) {
        const mainHandWeapon = this.combatState.player.equipment.mainHand;
        const offHandWeapon = this.combatState.player.equipment.offHand;
        
        let isShortsword = false;
        if (mainHandWeapon) {
          const mainWeaponData = ItemDatabase.getItem(mainHandWeapon.itemId);
          if (mainWeaponData && 'weaponType' in mainWeaponData && mainWeaponData.weaponType === 'shortsword') {
            isShortsword = true;
          }
        }
        if (!isShortsword && offHandWeapon) {
          const offWeaponData = ItemDatabase.getItem(offHandWeapon.itemId);
          if (offWeaponData && 'weaponType' in offWeaponData && offWeaponData.weaponType === 'shortsword') {
            isShortsword = true;
          }
        }
        
        if (isShortsword) {
          const dependableBonus = dependableCondition.stacks * 0.1;
          adjustedMultiplier += dependableBonus;
        }
      }
    }
    
    if (adjustedMultiplier === 1) return baseDamage;

    return {
      numDice: Math.floor(baseDamage.numDice * adjustedMultiplier),
      dieSize: baseDamage.dieSize,
      modifier: Math.floor(baseDamage.modifier * adjustedMultiplier),
    };
  }

  private getCritThreshold(attack: WeaponAttack): number {
    if (attack.name === 'Backstab' || attack.name === 'Savage Strike') {
      return 19;
    }
    if (attack.name === 'Crimson Mist') {
      return 18;
    }
    return 20;
  }

  private rollAttackWithBonus(critThreshold: number): { d20: number; total: number; critical: boolean } {
    if (!this.combatState) {
      return { d20: 1, total: 1, critical: false };
    }

    const d20 = Math.floor(Math.random() * 20) + 1;
    const attackBonus = this.combatState.player.stats.attackBonus;
    const dependableBonus = ConditionManager.getDependableBonus(this.combatState.player);
    
    const attackRollBonus = BuffManager.getAttackRollBonus(this.combatState.player);
    let bonusRoll = 0;
    if (attackRollBonus) {
      const roll = DiceRoller.rollDiceTotal({ ...attackRollBonus, modifier: 0 });
      bonusRoll = roll.total;
    }

    const weakenedPenalty = ConditionManager.hasCondition(this.combatState.player, 'weakened') ? -2 : 0;

    const total = d20 + attackBonus + dependableBonus + bonusRoll + weakenedPenalty;
    const critical = d20 >= critThreshold;

    return { d20, total, critical };
  }

  private calculateDamage(
    weaponDamage: DiceRoll,
    isCritical: boolean,
    target: Enemy,
    attackName: string
  ): { damage: number; damageBeforeReduction: number; damageRollInfo: string } {
    if (!this.combatState) {
      return { damage: 0, damageBeforeReduction: 0, damageRollInfo: '' };
    }

    let damageBeforeReduction: number;
    let damageRollInfo: string;
    
    const buffDamageBonus = BuffManager.getDamageBonus(this.combatState.player);

    if (isCritical) {
      const critResult = DiceRoller.rollCriticalDamage(weaponDamage);
      damageBeforeReduction = critResult.total + buffDamageBonus;
      const buffText = buffDamageBonus > 0 ? ` +${buffDamageBonus} (buff)` : '';
      damageRollInfo = `CRITICAL HIT! (${critResult.maxDie} max + ${critResult.extraRoll} roll + ${critResult.modifier}${buffText} = ${damageBeforeReduction})`;
    } else {
      const damageResult = DiceRoller.rollDiceTotal(weaponDamage);
      damageBeforeReduction = damageResult.total + buffDamageBonus;
      const rollsStr = damageResult.rolls.join('+');
      const buffText = buffDamageBonus > 0 ? `+${buffDamageBonus}` : '';
      damageRollInfo = `(${rollsStr}+${damageResult.modifier}${buffText ? '+' + buffText : ''} = ${damageBeforeReduction})`;
    }

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(this.combatState.player, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(this.combatState.player, 'empowered')) {
      damageMultiplier *= 1.25;
    }

    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = target.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(target);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    return { damage, damageBeforeReduction, damageRollInfo };
  }

  private applyConditionFromAttack(target: Enemy, attack: WeaponAttack): void {
    if (!this.combatState || !attack.conditionInflicted || !attack.conditionChance) {
      return;
    }

    if (attack.name === 'Mace' && attack.conditionInflicted === 'stunned') {
      return;
    }

    const roll = Math.random() * 100;
    if (roll < attack.conditionChance) {
      let stacksToApply = 1;
      
      if (attack.name === 'Hydras Strike' && attack.conditionInflicted === 'poisoned') {
        if (ConditionManager.hasCondition(target, 'poisoned')) {
          stacksToApply = Math.ceil(1 * 1.5);
          this.combatState.combatLog.push(`Hydra's venom intensifies on poisoned target! +50% poison stacks!`);
        }
      }
      
      ConditionManager.applyCondition(target, attack.conditionInflicted, attack.conditionDuration || 1, stacksToApply);
      const conditionName = ConditionManager.getConditionDisplayName(attack.conditionInflicted);
      this.combatState.combatLog.push(`${target.name} is afflicted with ${conditionName}!`);
    }
  }

  deductActions(actionCost: number): void {
    if (!this.combatState) return;
    this.combatState.actionsRemaining -= actionCost;
  }

  private checkAndEndPlayerTurn(): void {
    if (!this.combatState) return;
    
    if (this.combatState.actionsRemaining < 1) {
      this.endPlayerTurn();
    }
  }

  private trackDamageToEnemy(enemy: Enemy, damage: number): void {
    if (!this.combatState) return;
    if (!enemy.damageReceivedHistory) return;
    
    enemy.damageReceivedHistory.push({
      round: this.combatState.currentRound || 0,
      damage: damage
    });
  }

  endPlayerTurn(): void {
    if (!this.combatState) return;
    
    this.checkCombatEnd();
    if (!this.combatState.isComplete) {
      this.combatState.currentTurn = 'enemy';
    }
  }

  enemyTurnStart(): void {
    if (!this.combatState) return;

    const aliveEnemies = this.combatState.enemies.filter(e => e.health > 0);
    
    for (const enemy of aliveEnemies) {
      if (ConditionManager.isStunned(enemy)) {
        this.combatState.combatLog.push(`${enemy.name} is stunned and cannot act!`);
        continue;
      }

      const poisonTick = ConditionManager.tickPoisonOnly(enemy);
      if (poisonTick.damage > 0) {
        enemy.health = Math.max(0, enemy.health - poisonTick.damage);
        poisonTick.messages.forEach(msg => this.combatState!.combatLog.push(`[${enemy.name}] ${msg}`));
        
        if (enemy.health <= 0) {
          this.combatState.combatLog.push(`${enemy.name} succumbed to poison!`);
        }
      }
    }
  }

  enemyTurnEnd(): void {
    if (!this.combatState) return;

    const aliveEnemies = this.combatState.enemies.filter(e => e.health > 0);
    
    for (const enemy of aliveEnemies) {
      const bleedTick = ConditionManager.tickBleedingOnly(enemy);
      if (bleedTick.damage > 0) {
        enemy.health = Math.max(0, enemy.health - bleedTick.damage);
        bleedTick.messages.forEach(msg => this.combatState!.combatLog.push(`[${enemy.name}] ${msg}`));
        
        if (enemy.health <= 0) {
          this.combatState.combatLog.push(`${enemy.name} bled out!`);
        }
      }
    }
  }

  enemyTurn(): string[] {
    if (!this.combatState || this.combatState.currentTurn !== 'enemy') {
      return ['Not enemy turn!'];
    }

    const logs: string[] = [];
    const aliveEnemies = this.combatState.enemies.filter(e => e.health > 0);

    for (const enemy of aliveEnemies) {
      if (ConditionManager.isStunned(enemy)) {
        continue;
      }

      if (enemy.name === 'Greater Void Spawn' && enemy.chronostepUsesRemaining && enemy.chronostepUsesRemaining > 0) {
        const healthPercent = enemy.health / enemy.maxHealth;
        if (healthPercent < 0.4 && Math.random() < 0.7) {
          const chronostepLogs = this.useChronostep(enemy);
          logs.push(...chronostepLogs);
          continue;
        }
      }

      if (enemy.name === 'Void Spawn' && Math.random() < 0.35) {
        const sploogeLogs = this.useSplooge(enemy);
        logs.push(...sploogeLogs);
        continue;
      }

      if (enemy.name === 'Skitterthid' && Math.random() < 0.35) {
        const poisonBarbLogs = this.usePoisonBarb(enemy);
        logs.push(...poisonBarbLogs);
        continue;
      }

      if (enemy.name === 'Hollow Husk' && Math.random() < 0.30) {
        const agonizingBiteLogs = this.useAgonizingBite(enemy);
        logs.push(...agonizingBiteLogs);
        continue;
      }

      if (enemy.name === 'Wailing Wisp' && Math.random() < 0.40) {
        const shrillTouchLogs = this.useShrillTouch(enemy);
        logs.push(...shrillTouchLogs);
        continue;
      }

      if (enemy.name === 'Crawley Crow' && !enemy.itemStolen && Math.random() < 0.50) {
        const shinyShinyLogs = this.useShinyShiny(enemy);
        logs.push(...shinyShinyLogs);
        continue;
      }

      if (enemy.name === 'Aetherbear') {
        const roarRoll = Math.random();
        const slamRoll = Math.random();
        
        if (roarRoll < 0.25) {
          const roarLogs = this.useMightyRoar(enemy);
          logs.push(...roarLogs);
          continue;
        } else if (slamRoll < 0.30) {
          const slamLogs = this.useCrushingSlam(enemy);
          logs.push(...slamLogs);
          continue;
        }
      }

      const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
      const attackResult = DiceRoller.rollAttack(3 + weakenedPenalty);
      const playerEvasion = this.combatState.player.stats.calculatedEvasion + 
                            ConditionManager.getEvasionBonus(this.combatState.player);
      const hit = attackResult.total >= playerEvasion;

      if (!hit) {
        const missMessage = `${enemy.name} swings and misses! (Rolled ${attackResult.d20}+3=${attackResult.total} vs Evasion ${playerEvasion})`;
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

      let damageMultiplier = 1.0;
      if (ConditionManager.hasCondition(enemy, 'weakened')) {
        damageMultiplier *= 0.9;
      }
      if (ConditionManager.hasCondition(enemy, 'empowered')) {
        damageMultiplier *= 1.25;
      }
      
      damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

      const baseDR = this.combatState.player.stats.damageReduction;
      const bonusDR = ConditionManager.getDamageReductionBonus(this.combatState.player);
      const totalDR = Math.min(baseDR + bonusDR, 0.95);
      
      const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

      this.combatState.player.health = Math.max(
        0,
        this.combatState.player.health - damage
      );

      let logMessage = `${enemy.name} hits you! ${damageRollInfo}`;
      if (totalDR > 0) {
        logMessage += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction`;
      } else {
        logMessage += ` -> ${damage} damage`;
      }
      
      this.combatState.combatLog.push(logMessage);
      logs.push(logMessage);
    }

    this.checkCombatEnd();

    if (!this.combatState.isComplete) {
      this.combatState.currentTurn = 'player';
      if (this.combatState.currentRound !== undefined) {
        this.combatState.currentRound++;
      }
    }

    return logs;
  }

  private useSplooge(enemy: Enemy): string[] {
    if (!this.combatState) return [];
    
    const logs: string[] = [];
    const duration = DiceRoller.rollD4();
    
    ConditionManager.applyCondition(this.combatState.player, 'slowed', duration, 1);
    
    const message = `${enemy.name} uses Splooge! You're covered in void-touched goo! (Slowed for ${duration} rounds)`;
    this.combatState.combatLog.push(message);
    logs.push(message);
    
    return logs;
  }

  private useChronostep(enemy: Enemy): string[] {
    if (!this.combatState || !enemy.chronostepUsesRemaining || enemy.chronostepUsesRemaining <= 0) return [];
    
    const logs: string[] = [];
    const lookbackRounds = DiceRoller.rollD4();
    
    let totalHealing = 0;
    if (enemy.damageReceivedHistory) {
      const currentRound = this.combatState.currentRound || 0;
      const relevantDamage = enemy.damageReceivedHistory.filter(
        entry => entry.round >= currentRound - lookbackRounds && entry.round < currentRound
      );
      totalHealing = relevantDamage.reduce((sum, entry) => sum + entry.damage, 0);
    }
    
    enemy.health = Math.min(enemy.maxHealth, enemy.health + totalHealing);
    enemy.chronostepUsesRemaining--;
    
    const message = `${enemy.name} uses Chronostep! Time reverses ${lookbackRounds} rounds, healing ${totalHealing} HP! (${enemy.chronostepUsesRemaining} uses remaining)`;
    this.combatState.combatLog.push(message);
    logs.push(message);
    
    return logs;
  }

  private usePoisonBarb(enemy: Enemy): string[] {
    if (!this.combatState) return [];
    
    const logs: string[] = [];
    const specialAttackBonus = 2;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    const attackResult = DiceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = this.combatState.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(this.combatState.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Poison Barb but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      this.combatState.combatLog.push(missMessage);
      logs.push(missMessage);
      return logs;
    }

    const damageRoll: DiceRoll = { numDice: 1, dieSize: 8, modifier: 2 };
    const damageResult = DiceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = this.combatState.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(this.combatState.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    this.combatState.player.health = Math.max(0, this.combatState.player.health - damage);

    const poisonStacks = DiceRoller.rollD4();
    ConditionManager.applyCondition(this.combatState.player, 'poisoned', 3, poisonStacks);

    let message = `${enemy.name} uses Poison Barb! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction and ${poisonStacks} stacks of poison applied!`;
    } else {
      message += ` -> ${damage} damage and ${poisonStacks} stacks of poison applied!`;
    }
    this.combatState.combatLog.push(message);
    logs.push(message);

    return logs;
  }

  private useAgonizingBite(enemy: Enemy): string[] {
    if (!this.combatState) return [];
    
    const logs: string[] = [];
    const specialAttackBonus = -1;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    const attackResult = DiceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = this.combatState.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(this.combatState.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Agonizing Bite but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      this.combatState.combatLog.push(missMessage);
      logs.push(missMessage);
      return logs;
    }

    const damageRoll: DiceRoll = { numDice: 1, dieSize: 10, modifier: 0 };
    const damageResult = DiceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = this.combatState.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(this.combatState.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    this.combatState.player.health = Math.max(0, this.combatState.player.health - damage);

    const weakenedDuration = DiceRoller.rollDice(1, 3)[0];
    ConditionManager.applyCondition(this.combatState.player, 'weakened', weakenedDuration, 1);

    let message = `${enemy.name} uses Agonizing Bite! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction and weakened for ${weakenedDuration} rounds!`;
    } else {
      message += ` -> ${damage} damage and weakened for ${weakenedDuration} rounds!`;
    }
    this.combatState.combatLog.push(message);
    logs.push(message);

    return logs;
  }

  private useShrillTouch(enemy: Enemy): string[] {
    if (!this.combatState) return [];
    
    const logs: string[] = [];
    const specialAttackBonus = 2;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    const attackResult = DiceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = this.combatState.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(this.combatState.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Shrill Touch but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      this.combatState.combatLog.push(missMessage);
      logs.push(missMessage);
      return logs;
    }

    const damageRoll: DiceRoll = { numDice: 2, dieSize: 4, modifier: 2 };
    const damageResult = DiceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = this.combatState.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(this.combatState.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    this.combatState.player.health = Math.max(0, this.combatState.player.health - damage);

    const poisonStacks = DiceRoller.rollDice(1, 2)[0];
    ConditionManager.applyCondition(this.combatState.player, 'poisoned', 3, poisonStacks);

    let message = `${enemy.name} uses Shrill Touch! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction and ${poisonStacks} stacks of poison applied!`;
    } else {
      message += ` -> ${damage} damage and ${poisonStacks} stacks of poison applied!`;
    }
    this.combatState.combatLog.push(message);
    logs.push(message);

    return logs;
  }

  private useShinyShiny(enemy: Enemy): string[] {
    if (!this.combatState) return [];
    
    const logs: string[] = [];
    const specialAttackBonus = 1;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    const attackResult = DiceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = this.combatState.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(this.combatState.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} tries Shiny Shiny but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      this.combatState.combatLog.push(missMessage);
      logs.push(missMessage);
      return logs;
    }

    const inventoryItems = this.combatState.player.inventory.filter(item => item.quantity > 0);
    
    if (inventoryItems.length === 0) {
      const noItemMessage = `${enemy.name} uses Shiny Shiny but you have no items to steal!`;
      this.combatState.combatLog.push(noItemMessage);
      logs.push(noItemMessage);
      return logs;
    }

    const randomIndex = Math.floor(Math.random() * inventoryItems.length);
    const stolenItem = inventoryItems[randomIndex];
    const itemData = ItemDatabase.getItem(stolenItem.itemId);
    const itemName = itemData ? itemData.name : stolenItem.itemId;

    if (stolenItem.quantity > 1) {
      stolenItem.quantity -= 1;
    } else {
      const inventoryIndex = this.combatState.player.inventory.indexOf(stolenItem);
      if (inventoryIndex > -1) {
        this.combatState.player.inventory.splice(inventoryIndex, 1);
      }
    }

    enemy.itemStolen = true;

    const stealMessage = `${enemy.name} uses Shiny Shiny! Stole ${itemName} from your inventory!`;
    this.combatState.combatLog.push(stealMessage);
    logs.push(stealMessage);

    const fleeTarget = 12 + this.combatState.player.level;
    const fleeRoll = DiceRoller.rollD20();

    if (fleeRoll > fleeTarget) {
      const fleeMessage = `${enemy.name} flees with the stolen item! (Rolled ${fleeRoll} vs ${fleeTarget}) Combat ends!`;
      this.combatState.combatLog.push(fleeMessage);
      logs.push(fleeMessage);
      
      enemy.health = 0;
      this.checkCombatEnd();
    } else {
      const failMessage = `${enemy.name} tries to flee but is stuck in combat! (Rolled ${fleeRoll} vs ${fleeTarget})`;
      this.combatState.combatLog.push(failMessage);
      logs.push(failMessage);
    }

    return logs;
  }

  private useMightyRoar(enemy: Enemy): string[] {
    if (!this.combatState) return [];
    
    const logs: string[] = [];
    const duration = DiceRoller.rollD4() + 2;
    
    ConditionManager.applyCondition(enemy, 'empowered', duration, 1);
    
    const message = `${enemy.name} uses Mighty Roar! Gains empowered status for ${duration} rounds!`;
    this.combatState.combatLog.push(message);
    logs.push(message);
    
    return logs;
  }

  private useCrushingSlam(enemy: Enemy): string[] {
    if (!this.combatState) return [];
    
    const logs: string[] = [];
    const specialAttackBonus = 3;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    const attackResult = DiceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = this.combatState.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(this.combatState.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Crushing Slam but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      this.combatState.combatLog.push(missMessage);
      logs.push(missMessage);
      
      if (Math.random() < 0.25) {
        ConditionManager.applyCondition(enemy, 'stunned', 1, 1);
        const selfStunMessage = `${enemy.name} loses balance and is stunned for 1 round!`;
        this.combatState.combatLog.push(selfStunMessage);
        logs.push(selfStunMessage);
      }
      
      return logs;
    }

    const damageRoll: DiceRoll = { numDice: 3, dieSize: 8, modifier: 4 };
    const damageResult = DiceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = this.combatState.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(this.combatState.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    this.combatState.player.health = Math.max(0, this.combatState.player.health - damage);

    let message = `${enemy.name} uses Crushing Slam! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction!`;
    } else {
      message += ` -> ${damage} damage!`;
    }
    
    if (Math.random() < 0.15) {
      ConditionManager.applyCondition(this.combatState.player, 'stunned', 1, 1);
      message += ' You are stunned for 1 round!';
    }
    
    this.combatState.combatLog.push(message);
    logs.push(message);

    return logs;
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

  private createFailedAttack(message: string, attackRoll: number = 0): AttackResult {
    return {
      hit: false,
      critical: false,
      attackRoll,
      damage: 0,
      damageBeforeReduction: 0,
      message,
    };
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

  updatePlayerHealth(health: number): void {
    if (this.combatState) {
      this.combatState.player.health = health;
    }
  }

  updatePlayerStamina(stamina: number): void {
    if (this.combatState) {
      this.combatState.player.stamina = stamina;
    }
  }

  endCombat(): void {
    this.combatState = null;
  }
}
