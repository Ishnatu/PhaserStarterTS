import { CombatState, Enemy, PlayerData, AttackResult, WeaponData, WeaponAttack, DiceRoll } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';
import { DiceRoller } from '../utils/DiceRoller';
import { EquipmentManager } from './EquipmentManager';
import { BuffManager } from './BuffManager';
import { ForgingSystem } from './ForgingSystem';
import { ConditionManager } from './ConditionManager';
import { WeaponAttackDatabase } from '../config/WeaponAttackDatabase';

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
        backstabUsed: false 
      })),
      currentTurn: 'player',
      currentEnemyIndex: 0,
      combatLog: ['Combat has begun!'],
      isComplete: false,
      playerVictory: false,
      isWildEncounter,
      actionsRemaining: 2,
      maxActionsPerTurn: 2,
    };

    return this.combatState;
  }

  playerTurnStart(): void {
    if (!this.combatState) return;

    this.combatState.actionsRemaining = this.combatState.maxActionsPerTurn;

    if (ConditionManager.isStunned(this.combatState.player)) {
      this.combatState.combatLog.push('You are stunned and cannot act!');
      ConditionManager.tickConditions(this.combatState.player);
      this.combatState.currentTurn = 'enemy';
      return;
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

    if (attack.name === 'Sweeping Strike') {
      return this.executeSweepingStrike(targetIndex, attack);
    }

    if (attack.name === 'Arcing Blade') {
      return this.executeArcingBlade(attack);
    }

    if (attack.name === 'Spinning Flurry') {
      return this.executeSpinningFlurry(attack);
    }

    if (attack.name === 'Murderous Intent') {
      return this.executeMurderousIntent(attack);
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
    
    let logMessage = `[${weaponLabel}] You hit ${target.name} with ${attack.name}! ${damageRollInfo} -> ${damage} damage (-${attack.staminaCost} stamina)`;
    this.combatState.combatLog.push(logMessage);

    this.applyConditionFromAttack(target, attack);

    if (attack.name === 'Backstab' && attackResult.critical) {
      target.backstabUsed = true;
    }

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
    
    let logMessage = `You hit ${target.name} with ${attack.name}! ${damageRollInfo} -> ${damage} damage (-${attack.staminaCost} stamina)`;
    this.combatState.combatLog.push(logMessage);

    this.applyConditionFromAttack(target, attack);

    if (attack.name === 'Backstab' && attackResult.critical) {
      target.backstabUsed = true;
    }

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
      if (!target || target.health <= 0) break;

      const result = this.executeSingleStrike(target, attack, `Puncture strike ${i + 1}`);
      anyHit = anyHit || result.hit;
      anyCrit = anyCrit || result.critical;
      attackRoll = Math.max(attackRoll, result.attackRoll);
      totalDamage += result.damage;
      totalDamageBeforeReduction += result.damageBeforeReduction;

      if (target.health <= 0) {
        this.combatState.combatLog.push(`${target.name} has been defeated!`);
        break;
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

    for (let sweep = 0; sweep < 3; sweep++) {
      this.combatState.combatLog.push(`Sweep ${sweep + 1}:`);
      
      for (const enemy of this.combatState.enemies) {
        if (enemy.health <= 0) continue;

        const result = this.executeSingleStrike(enemy, attack, `Sweep ${sweep + 1} on ${enemy.name}`);
        anyHit = anyHit || result.hit;
        anyCrit = anyCrit || result.critical;
        attackRoll = Math.max(attackRoll, result.attackRoll);
        totalDamage += result.damage;

        if (enemy.health <= 0) {
          this.combatState.combatLog.push(`${enemy.name} has been defeated!`);
        }
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
      message: `Spinning Flurry complete! Total: ${totalDamage} damage`,
    };
  }

  private executeMurderousIntent(attack: WeaponAttack): AttackResult{
    if (!this.combatState) {
      return this.createFailedAttack('No combat state!');
    }

    this.combatState.combatLog.push('Murderous Intent - savage strike to all enemies!');
    
    let totalDamage = 0;
    let anyHit = false;
    let anyCrit = false;
    let attackRoll = 0;
    let enemyKilled = false;

    for (const enemy of this.combatState.enemies) {
      if (enemy.health <= 0) continue;

      const result = this.executeSingleStrike(enemy, attack, `Murderous Intent on ${enemy.name}`);
      anyHit = anyHit || result.hit;
      anyCrit = anyCrit || result.critical;
      attackRoll = Math.max(attackRoll, result.attackRoll);
      totalDamage += result.damage;

      if (enemy.health <= 0) {
        this.combatState.combatLog.push(`${enemy.name} has been defeated!`);
        enemyKilled = true;
      }
    }

    if (enemyKilled) {
      this.combatState.combatLog.push('An enemy died! Bonus savage strike activates (no stamina cost)!');
      for (const enemy of this.combatState.enemies) {
        if (enemy.health <= 0) continue;

        const bonusResult = this.executeSingleStrike(enemy, attack, `Bonus savage strike on ${enemy.name}`);
        totalDamage += bonusResult.damage;

        if (enemy.health <= 0) {
          this.combatState.combatLog.push(`${enemy.name} has been defeated!`);
        }
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

  private applyDamageMultiplier(baseDamage: DiceRoll, multiplier: number): DiceRoll {
    if (multiplier === 1) return baseDamage;

    return {
      numDice: Math.floor(baseDamage.numDice * multiplier),
      dieSize: baseDamage.dieSize,
      modifier: Math.floor(baseDamage.modifier * multiplier),
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

    const total = d20 + attackBonus + dependableBonus + bonusRoll;
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
      ConditionManager.applyCondition(target, attack.conditionInflicted, attack.conditionDuration || 1);
      const conditionName = ConditionManager.getConditionDisplayName(attack.conditionInflicted);
      this.combatState.combatLog.push(`${target.name} is afflicted with ${conditionName}!`);
    }
  }

  private deductActions(actionCost: number): void {
    if (!this.combatState) return;
    this.combatState.actionsRemaining -= actionCost;
  }

  private checkAndEndPlayerTurn(): void {
    if (!this.combatState) return;
    
    if (this.combatState.actionsRemaining < 1) {
      this.endPlayerTurn();
    }
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
        ConditionManager.tickConditions(enemy);
        continue;
      }

      const tickResult = ConditionManager.tickConditions(enemy);
      if (tickResult.damage > 0) {
        enemy.health = Math.max(0, enemy.health - tickResult.damage);
        tickResult.messages.forEach(msg => this.combatState!.combatLog.push(`[${enemy.name}] ${msg}`));
        
        if (enemy.health <= 0) {
          this.combatState.combatLog.push(`${enemy.name} succumbed to conditions!`);
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

      const attackResult = DiceRoller.rollAttack(3);
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
    }

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
