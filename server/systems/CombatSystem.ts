/**
 * Server-side Combat System
 * 
 * This is the AUTHORITATIVE combat resolution engine for Gemforge Chronicles.
 * All combat calculations, RNG rolls, and state transitions happen here on the server.
 * 
 * SECURITY-CRITICAL: All random number generation happens server-side to prevent client manipulation.
 * RNG operations are clearly marked with [SERVER RNG] comments.
 * 
 * Design Philosophy:
 * - Stateless functions that take combat state as input and return updated state
 * - All game rules and mechanics must match src/systems/CombatSystem.ts exactly
 * - No dependencies on client-side code (ItemDatabase, etc.)
 * - Clear audit trail through combat logs
 */

import { 
  CombatState, 
  Enemy, 
  PlayerData, 
  AttackResult, 
  WeaponData, 
  WeaponAttack, 
  DiceRoll,
  StatusConditionType 
} from '../../shared/types';
import { DiceRoller } from './DiceRoller';
import { SeededRNG } from '../utils/SeededRNG';
import { ConditionManager } from './ConditionManager';
import { DeepClone } from '../utils/DeepClone';

/**
 * Helper function to calculate enhanced weapon damage based on enhancement level
 * Matches ForgingSystem.calculateEnhancedDamage logic
 */
function calculateEnhancedDamage(baseWeapon: WeaponData, enhancementLevel: number): DiceRoll {
  if (enhancementLevel === 0) {
    return { ...baseWeapon.damage };
  }

  // Enhancement structure:
  // +1, +3: durability only
  // +2, +4, +6, +8: durability + 1 damage modifier
  // +5, +7, +9: durability + additional damage dice
  
  let bonusDice = 0;
  if (enhancementLevel >= 5) bonusDice++;
  if (enhancementLevel >= 7) bonusDice++;
  if (enhancementLevel >= 9) bonusDice++;

  let damageModifierBonus = 0;
  if (enhancementLevel >= 2) damageModifierBonus++;
  if (enhancementLevel >= 4) damageModifierBonus++;
  if (enhancementLevel >= 6) damageModifierBonus++;
  if (enhancementLevel >= 8) damageModifierBonus++;

  return {
    numDice: baseWeapon.damage.numDice + bonusDice,
    dieSize: baseWeapon.damage.dieSize,
    modifier: baseWeapon.damage.modifier + damageModifierBonus
  };
}

/**
 * Helper to get equipped weapon with enhancement
 */
/**
 * INTENTIONALLY UNIMPLEMENTED: Server-authoritative architecture
 * 
 * In the server-authoritative design, weapon data is sent by the client with each attack request
 * via WeaponAttack.weaponData and WeaponAttack.enhancementLevel fields.
 * The server does not maintain an ItemDatabase to avoid data sync issues.
 * 
 * This function exists for API compatibility but is never called.
 * Weapon validation happens in the combat API endpoints, not here.
 */
function getEquippedWeaponWithEnhancement(player: PlayerData): { weapon: WeaponData; enhancementLevel: number } | undefined {
  if (!player.equipment.mainHand) return undefined;
  return undefined;
}

/**
 * Helper to check if player is dual wielding
 */
function isDualWielding(player: PlayerData): boolean {
  return !!(player.equipment.mainHand && player.equipment.offHand);
}

/**
 * Main Combat System class - provides stateless combat resolution functions
 */
export class CombatSystem {
  constructor(private diceRoller: DiceRoller) {}

  /**
   * Initialize combat state with player and enemies
   * [SERVER RNG] N/A - pure initialization
   */
  initiateCombat(player: PlayerData, enemies: Enemy[], isWildEncounter: boolean = false): CombatState {
    // Ensure status conditions array exists
    if (!player.statusConditions) {
      player.statusConditions = [];
    }
    
    const state: CombatState = {
      player: { ...player, statusConditions: [...(player.statusConditions || [])] },
      enemies: enemies.map(e => ({ 
        ...e, 
        statusConditions: e.statusConditions || [],
        backstabUsed: false,
        // Greater Void Spawn specific
        chronostepUsesRemaining: e.name === 'Greater Void Spawn' ? 2 : undefined,
        damageReceivedHistory: e.name === 'Greater Void Spawn' ? [] : undefined,
        // Crawley Crow specific
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

    return state;
  }

  /**
   * Start player turn - handle status effects and action economy
   * [SERVER RNG] N/A - condition ticks use deterministic damage
   */
  playerTurnStart(state: CombatState): CombatState {
    const newState = DeepClone.combatState(state);

    // Check slowed condition for action economy
    const isSlowed = ConditionManager.hasCondition(newState.player, 'slowed');
    newState.actionsRemaining = isSlowed ? 1 : newState.maxActionsPerTurn;

    // Stunned players skip their turn
    if (ConditionManager.isStunned(newState.player)) {
      newState.combatLog.push('You are stunned and cannot act!');
      ConditionManager.tickConditions(newState.player);
      newState.currentTurn = 'enemy';
      return newState;
    }
    
    if (isSlowed) {
      newState.combatLog.push('You are slowed! Only 1 action this turn.');
    }

    // Tick conditions and apply damage
    const tickResult = ConditionManager.tickConditions(newState.player);
    if (tickResult.damage > 0) {
      newState.player.health = Math.max(0, newState.player.health - tickResult.damage);
      tickResult.messages.forEach(msg => newState.combatLog.push(`[Player] ${msg}`));
      
      if (newState.player.health <= 0) {
        newState.combatLog.push('You succumbed to your conditions...');
        this.checkCombatEnd(newState);
      }
    }

    return newState;
  }

  /**
   * Execute a player attack
   * [SERVER RNG] All dice rolls happen here - attack rolls, damage rolls, critical hits, condition procs
   */
  playerAttack(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);

    // Validation
    if (newState.currentTurn !== 'player') {
      return {
        state: newState,
        result: this.createFailedAttack('Not player turn!')
      };
    }

    if (ConditionManager.isStunned(newState.player)) {
      return {
        state: newState,
        result: this.createFailedAttack('You are stunned and cannot attack!')
      };
    }

    const target = newState.enemies[targetIndex];
    if (!target || target.health <= 0) {
      return {
        state: newState,
        result: this.createFailedAttack('Invalid target!')
      };
    }

    if (newState.player.stamina < attack.staminaCost) {
      return {
        state: newState,
        result: this.createFailedAttack('Not enough stamina to attack!')
      };
    }

    // Deduct stamina
    newState.player.stamina = Math.max(0, newState.player.stamina - attack.staminaCost);

    // Execute the attack based on type
    const { state: updatedState, result } = this.executeAttack(newState, targetIndex, attack);
    
    return { state: updatedState, result };
  }

  /**
   * Route attack to appropriate handler
   * [SERVER RNG] Delegated to specific attack functions
   */
  private executeAttack(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const target = state.enemies[targetIndex];

    // Special weapon attacks with specified weapon data
    if (attack.weaponData && attack.enhancementLevel !== undefined && attack.sourceHand) {
      const weaponLabel = attack.sourceHand === 'mainHand' ? 'main hand' : 'off hand';
      return this.executeAttackWithSpecifiedWeapon(state, targetIndex, attack, attack.weaponData, attack.enhancementLevel, weaponLabel);
    }

    // Special multi-hit attacks
    if (attack.name === 'Puncture') {
      return this.executePuncture(state, targetIndex, attack);
    }

    if (attack.name === 'Vipers Fangs') {
      return this.executeVipersFangs(state, targetIndex, attack);
    }

    // AOE attacks
    if (attack.name === 'Arcing Blade') {
      return this.executeArcingBlade(state, attack);
    }

    if (attack.name === 'Spinning Flurry') {
      return this.executeSpinningFlurry(state, attack);
    }

    // Special damage attacks
    if (attack.name === 'Murderous Intent') {
      return this.executeMurderousIntent(state, targetIndex, attack);
    }

    if (attack.name === 'Crimson Mist') {
      return this.executeCrimsonMist(state, targetIndex, attack);
    }

    if (attack.name === 'Bloodfury') {
      return this.executeBloodfury(state, targetIndex, attack);
    }

    if (attack.name === 'Savage Strike') {
      return this.executeSavageStrike(state, targetIndex, attack);
    }

    // Shield abilities
    if (attack.name === 'Shield Wall' || attack.name === 'Shield Slam') {
      return this.executeShieldAbility(state, targetIndex, attack);
    }

    // Defensive buffs
    if (attack.name === 'Disarming Strike' || attack.name === 'Guarding Strike' || 
        attack.name === 'Roll' || attack.name === 'Dust Up') {
      return this.executeDefensiveBuff(state, targetIndex, attack);
    }

    // Standard attack
    return this.executeStandardAttack(state, targetIndex, attack);
  }

  /**
   * Execute attack with specified weapon (for dual wielding)
   * [SERVER RNG] Attack roll, damage roll, critical hit determination, condition application
   */
  private executeAttackWithSpecifiedWeapon(
    state: CombatState,
    targetIndex: number,
    attack: WeaponAttack,
    weapon: WeaponData,
    enhancementLevel: number,
    weaponLabel: string
  ): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const target = newState.enemies[targetIndex];

    // Backstab can only be used once per target unless target is stunned
    if (attack.name === 'Backstab') {
      if (target.backstabUsed && !ConditionManager.isStunned(target)) {
        return {
          state: newState,
          result: this.createFailedAttack('Backstab already used on this target (unless stunned)!')
        };
      }
    }

    const baseDamage = calculateEnhancedDamage(weapon, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    
    // [SERVER RNG] Attack roll
    const attackResult = this.rollAttackWithBonus(newState.player, critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `[${weaponLabel}] You swing and miss! (-${attack.staminaCost} stamina)`;
      newState.combatLog.push(missMessage);
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);
      return {
        state: newState,
        result: this.createFailedAttack(missMessage, attackResult.d20)
      };
    }

    // [SERVER RNG] Damage calculation
    const { damage, damageRollInfo } = this.calculateDamage(
      newState.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(newState, target, damage);
    
    let logMessage = `[${weaponLabel}] You hit ${target.name} with ${attack.name}! ${damageRollInfo} -> ${damage} damage (-${attack.staminaCost} stamina)`;
    newState.combatLog.push(logMessage);

    // [SERVER RNG] Condition application
    this.applyConditionFromAttack(newState, target, attack);

    // Mark backstab as used on critical
    if (attack.name === 'Backstab' && attackResult.critical) {
      target.backstabUsed = true;
    }

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    // Cleave damage to other enemies
    if (attack.cleave && attack.cleave > 0) {
      this.applyCleave(newState, targetIndex, damage, attack.cleave, attack.name);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        message: logMessage,
      }
    };
  }

  /**
   * Execute standard attack using main hand weapon
   * [SERVER RNG] Attack roll, damage roll, critical hit, condition proc
   */
  private executeStandardAttack(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const target = newState.enemies[targetIndex];

    // For standard attacks, weapon data should be in attack.weaponData
    if (!attack.weaponData) {
      return {
        state: newState,
        result: this.createFailedAttack('No weapon data in attack!')
      };
    }

    const enhancementLevel = attack.enhancementLevel || 0;
    const baseDamage = calculateEnhancedDamage(attack.weaponData, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    
    // [SERVER RNG] Attack roll
    const attackResult = this.rollAttackWithBonus(newState.player, critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `You swing and miss! (-${attack.staminaCost} stamina)`;
      newState.combatLog.push(missMessage);
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);
      return {
        state: newState,
        result: this.createFailedAttack(missMessage, attackResult.d20)
      };
    }

    // [SERVER RNG] Damage calculation
    const { damage, damageRollInfo } = this.calculateDamage(
      newState.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(newState, target, damage);
    
    let logMessage = `You hit ${target.name} with ${attack.name}! ${damageRollInfo} -> ${damage} damage (-${attack.staminaCost} stamina)`;
    newState.combatLog.push(logMessage);

    // [SERVER RNG] Condition application
    this.applyConditionFromAttack(newState, target, attack);

    if (attack.name === 'Backstab' && attackResult.critical) {
      target.backstabUsed = true;
    }

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    if (attack.cleave && attack.cleave > 0) {
      this.applyCleave(newState, targetIndex, damage, attack.cleave, attack.name);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        message: logMessage,
      }
    };
  }

  /**
   * Puncture - 3 consecutive strikes
   * [SERVER RNG] 3 separate attack rolls and damage rolls
   */
  private executePuncture(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    
    newState.combatLog.push(`Executing Puncture - 3 consecutive attacks!`);
    
    let totalDamage = 0;
    let totalDamageBeforeReduction = 0;
    let anyHit = false;
    let anyCrit = false;
    let attackRoll = 0;

    for (let i = 0; i < 3; i++) {
      const target = newState.enemies[targetIndex];
      if (!target) break;

      const { result } = this.executeSingleStrike(newState, target, attack, `Puncture strike ${i + 1}`);
      anyHit = anyHit || result.hit;
      anyCrit = anyCrit || result.critical;
      attackRoll = Math.max(attackRoll, result.attackRoll);
      totalDamage += result.damage;
      

      if (target.health <= 0 && i === 0) {
        newState.combatLog.push(`${target.name} has been defeated!`);
      }
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: anyHit,
        critical: anyCrit,
        attackRoll,
        damage: totalDamage,
        
        message: `Puncture complete! Total: ${totalDamage} damage`,
      }
    };
  }

  /**
   * Viper's Fangs - Two strikes, second only if first hits
   * [SERVER RNG] Up to 2 attack/damage rolls
   */
  private executeVipersFangs(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const target = newState.enemies[targetIndex];
    
    const { result: firstStrike } = this.executeSingleStrike(newState, target, attack, 'Vipers Fangs first strike');

    // If first strike hits, trigger second strike (even if target is dead)
    if (firstStrike.hit) {
      newState.combatLog.push('Second strike triggered!');
      
      const { result: secondStrike } = this.executeSingleStrike(newState, target, attack, 'Vipers Fangs second strike');
      
      if (target.health <= 0) {
        newState.combatLog.push(`${target.name} has been defeated!`);
      }

      this.deductActions(newState, attack.actionCost);
      this.checkCombatEnd(newState);
      this.checkAndEndPlayerTurn(newState);

      const totalDamage = firstStrike.damage + secondStrike.damage;
      let resultMessage: string;
      
      if (secondStrike.hit) {
        resultMessage = `Vipers Fangs: Both strikes connected for ${totalDamage} total damage`;
      } else {
        resultMessage = `Vipers Fangs: First strike hit for ${firstStrike.damage} damage, second strike missed`;
      }

      return {
        state: newState,
        result: {
          hit: true,
          critical: firstStrike.critical || secondStrike.critical,
          attackRoll: Math.max(firstStrike.attackRoll, secondStrike.attackRoll),
          damage: totalDamage,
          
          message: resultMessage,
        }
      };
    }

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);
    
    return { state: newState, result: firstStrike };
  }

  /**
   * Arcing Blade - Hits all enemies
   * [SERVER RNG] One attack/damage roll per enemy
   */
  private executeArcingBlade(state: CombatState, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    
    newState.combatLog.push('Arcing Blade strikes all enemies!');
    
    let totalDamage = 0;
    let anyHit = false;
    let anyCrit = false;
    let attackRoll = 0;

    for (const enemy of newState.enemies) {
      if (enemy.health <= 0) continue;

      const { result } = this.executeSingleStrike(newState, enemy, attack, `Arcing Blade on ${enemy.name}`);
      anyHit = anyHit || result.hit;
      anyCrit = anyCrit || result.critical;
      attackRoll = Math.max(attackRoll, result.attackRoll);
      totalDamage += result.damage;

      if (enemy.health <= 0) {
        newState.combatLog.push(`${enemy.name} has been defeated!`);
      }
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: anyHit,
        critical: anyCrit,
        attackRoll,
        damage: totalDamage,
        
        message: `Arcing Blade complete! Total: ${totalDamage} damage across all enemies`,
      }
    };
  }

  /**
   * Spinning Flurry - 3 sweeping strikes to all enemies, grants evasion buff if 2+ hits
   * [SERVER RNG] 3 attacks per enemy, evasion buff condition based on hits
   */
  private executeSpinningFlurry(state: CombatState, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    
    newState.combatLog.push('Spinning Flurry - 3 sweeping strikes to all enemies!');
    
    let totalDamage = 0;
    let anyHit = false;
    let anyCrit = false;
    let attackRoll = 0;
    let totalHits = 0;

    for (let sweep = 0; sweep < 3; sweep++) {
      newState.combatLog.push(`Sweep ${sweep + 1}:`);
      
      for (const enemy of newState.enemies) {
        if (enemy.health <= 0) continue;

        const { result } = this.executeSingleStrike(newState, enemy, attack, `Sweep ${sweep + 1} on ${enemy.name}`);
        anyHit = anyHit || result.hit;
        anyCrit = anyCrit || result.critical;
        attackRoll = Math.max(attackRoll, result.attackRoll);
        totalDamage += result.damage;
        
        if (result.hit) {
          totalHits++;
        }

        if (enemy.health <= 0) {
          newState.combatLog.push(`${enemy.name} has been defeated!`);
        }
      }
    }
    
    if (totalHits >= 2) {
      ConditionManager.applyCondition(newState.player, 'raise_evasion', 2, 1);
      newState.combatLog.push(`Spinning Flurry momentum! Evasion raised by +3 for 2 rounds!`);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: anyHit,
        critical: anyCrit,
        attackRoll,
        damage: totalDamage,
        
        message: `Spinning Flurry complete! Total: ${totalDamage} damage`,
      }
    };
  }

  /**
   * Murderous Intent - Savage strike with cleave, 20% chance for bonus attack on kill
   * [SERVER RNG] Initial attack, proc roll for bonus attack
   */
  private executeMurderousIntent(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const primaryTarget = newState.enemies[targetIndex];
    
    newState.combatLog.push(`Murderous Intent - savage strike on ${primaryTarget.name}!`);
    
    const { result: primaryResult } = this.executeSingleStrike(newState, primaryTarget, attack, 'Murderous Intent (primary)');
    let totalDamage = primaryResult.damage;
    let enemyKilled = primaryTarget.health <= 0;

    if (enemyKilled) {
      newState.combatLog.push(`${primaryTarget.name} has been defeated!`);
    }

    if (primaryResult.hit && attack.cleave) {
      const enemiesBeforeCleave = newState.enemies.filter(e => e.health > 0).length;
      const cleaveDamage = Math.floor(primaryResult.damage * attack.cleave);
      const otherEnemies = newState.enemies.filter((e, i) => i !== targetIndex && e.health > 0);
      
      if (otherEnemies.length > 0) {
        this.applyCleave(newState, targetIndex, primaryResult.damage, attack.cleave, attack.name);
        totalDamage += cleaveDamage * otherEnemies.length;
      }
      
      const enemiesAfterCleave = newState.enemies.filter(e => e.health > 0).length;
      if (enemiesAfterCleave < enemiesBeforeCleave) {
        enemyKilled = true;
      }
    }

    // [SERVER RNG] 20% proc chance for bonus attack on kill
    if (enemyKilled) {
      if (this.diceRoller.checkPercentage(20, 'Murderous Intent proc')) {
        const remainingEnemies = newState.enemies.filter(e => e.health > 0);
        if (remainingEnemies.length > 0) {
          // [SERVER RNG] Random enemy selection
          const randomEnemy = remainingEnemies[this.diceRoller.randomInt(0, remainingEnemies.length - 1, 'Murderous Intent target')];
          newState.combatLog.push(`Murderous Intent procs! Bonus Savage Strike on ${randomEnemy.name} (no stamina cost)!`);
          
          const { result: bonusResult } = this.executeSingleStrike(newState, randomEnemy, attack, 'Bonus Savage Strike');
          totalDamage += bonusResult.damage;

          if (randomEnemy.health <= 0) {
            newState.combatLog.push(`${randomEnemy.name} has been defeated!`);
          }
        }
      }
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: primaryResult.hit,
        critical: primaryResult.critical,
        attackRoll: primaryResult.attackRoll,
        damage: totalDamage,
        
        message: `Murderous Intent complete! Total: ${totalDamage} damage`,
      }
    };
  }

  /**
   * Crimson Mist - High crit threshold (18), guaranteed bleed on crit
   * [SERVER RNG] Attack roll with 18+ crit threshold, damage roll
   */
  private executeCrimsonMist(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const target = newState.enemies[targetIndex];

    if (!attack.weaponData) {
      return {
        state: newState,
        result: this.createFailedAttack('No weapon data!')
      };
    }

    const enhancementLevel = attack.enhancementLevel || 0;
    const baseDamage = calculateEnhancedDamage(attack.weaponData, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    
    // [SERVER RNG] Attack roll with crit threshold 18
    const attackResult = this.rollAttackWithBonus(newState.player, 18);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `Crimson Mist misses! (-${attack.staminaCost} stamina)`;
      newState.combatLog.push(missMessage);
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);
      return {
        state: newState,
        result: this.createFailedAttack(missMessage, attackResult.d20)
      };
    }

    const { damage, damageRollInfo } = this.calculateDamage(
      newState.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(newState, target, damage);

    let logMessage = `Crimson Mist hits ${target.name}! ${damageRollInfo} -> ${damage} damage`;
    
    // Guaranteed bleed on crit
    if (attackResult.critical) {
      const bleedStacks = 3;
      ConditionManager.applyCondition(target, 'bleeding', 3, bleedStacks);
      logMessage += ` CRITICAL! ${bleedStacks} stacks of bleeding applied!`;
    }
    
    newState.combatLog.push(logMessage);

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        message: logMessage,
      }
    };
  }

  /**
   * Bloodfury - Vampiric attack that heals player
   * [SERVER RNG] Attack roll, damage roll
   */
  private executeBloodfury(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const target = newState.enemies[targetIndex];

    if (!attack.weaponData) {
      return {
        state: newState,
        result: this.createFailedAttack('No weapon data!')
      };
    }

    const enhancementLevel = attack.enhancementLevel || 0;
    const baseDamage = calculateEnhancedDamage(attack.weaponData, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    const attackResult = this.rollAttackWithBonus(newState.player, critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `Bloodfury misses! (-${attack.staminaCost} stamina)`;
      newState.combatLog.push(missMessage);
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);
      return {
        state: newState,
        result: this.createFailedAttack(missMessage, attackResult.d20)
      };
    }

    const { damage, damageRollInfo } = this.calculateDamage(
      newState.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(newState, target, damage);

    // Heal for 50% of damage dealt
    const healing = Math.floor(damage * 0.5);
    newState.player.health = Math.min(newState.player.maxHealth, newState.player.health + healing);

    let logMessage = `Bloodfury hits ${target.name}! ${damageRollInfo} -> ${damage} damage, healed ${healing} HP`;
    newState.combatLog.push(logMessage);

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        healing,
        message: logMessage,
      }
    };
  }

  /**
   * Savage Strike - High damage with 19+ crit threshold
   * [SERVER RNG] Attack roll with increased crit chance, damage roll
   */
  private executeSavageStrike(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const target = newState.enemies[targetIndex];

    if (!attack.weaponData) {
      return {
        state: newState,
        result: this.createFailedAttack('No weapon data!')
      };
    }

    const enhancementLevel = attack.enhancementLevel || 0;
    const baseDamage = calculateEnhancedDamage(attack.weaponData, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    
    // Savage Strike has crit threshold 19
    const attackResult = this.rollAttackWithBonus(newState.player, 19);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `Savage Strike misses! (-${attack.staminaCost} stamina)`;
      newState.combatLog.push(missMessage);
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);
      return {
        state: newState,
        result: this.createFailedAttack(missMessage, attackResult.d20)
      };
    }

    const { damage, damageRollInfo } = this.calculateDamage(
      newState.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(newState, target, damage);

    let logMessage = `Savage Strike hits ${target.name}! ${damageRollInfo} -> ${damage} damage`;
    newState.combatLog.push(logMessage);

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        message: logMessage,
      }
    };
  }

  /**
   * Shield abilities - Shield Wall (defense buff) and Shield Slam (damage + defense)
   * [SERVER RNG] Attack roll and damage for Shield Slam
   */
  private executeShieldAbility(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);

    if (attack.name === 'Shield Wall') {
      // Grant defense buff
      ConditionManager.applyCondition(newState.player, 'raise_defence', 3, 1);
      newState.combatLog.push('Shield Wall activated! Defense increased by 10% for 3 rounds!');
      
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);

      return {
        state: newState,
        result: {
          hit: true,
          critical: false,
          attackRoll: 0,
          damage: 0,
          bonusEvasion: 0,
          bonusEvasionDuration: 3,
          message: 'Shield Wall activated!',
        }
      };
    }

    // Shield Slam
    const target = newState.enemies[targetIndex];
    if (!attack.weaponData) {
      return {
        state: newState,
        result: this.createFailedAttack('No weapon data!')
      };
    }

    const enhancementLevel = attack.enhancementLevel || 0;
    const baseDamage = calculateEnhancedDamage(attack.weaponData, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    const attackResult = this.rollAttackWithBonus(newState.player, critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `Shield Slam misses! (-${attack.staminaCost} stamina)`;
      newState.combatLog.push(missMessage);
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);
      return {
        state: newState,
        result: this.createFailedAttack(missMessage, attackResult.d20)
      };
    }

    const { damage, damageRollInfo } = this.calculateDamage(
      newState.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(newState, target, damage);

    // Grant defense buff
    ConditionManager.applyCondition(newState.player, 'raise_defence', 2, 1);

    let logMessage = `Shield Slam hits ${target.name}! ${damageRollInfo} -> ${damage} damage and defense raised!`;
    newState.combatLog.push(logMessage);

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        message: logMessage,
      }
    };
  }

  /**
   * Defensive buff attacks - Disarming Strike, Guarding Strike, Roll, Dust Up
   * [SERVER RNG] Attack rolls, damage rolls, evasion buff application
   */
  private executeDefensiveBuff(state: CombatState, targetIndex: number, attack: WeaponAttack): { state: CombatState; result: AttackResult } {
    const newState = DeepClone.combatState(state);
    const target = newState.enemies[targetIndex];

    if (!attack.weaponData) {
      return {
        state: newState,
        result: this.createFailedAttack('No weapon data!')
      };
    }

    const enhancementLevel = attack.enhancementLevel || 0;
    const baseDamage = calculateEnhancedDamage(attack.weaponData, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    const attackResult = this.rollAttackWithBonus(newState.player, critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `${attack.name} misses! (-${attack.staminaCost} stamina)`;
      newState.combatLog.push(missMessage);
      this.deductActions(newState, attack.actionCost);
      this.checkAndEndPlayerTurn(newState);
      return {
        state: newState,
        result: this.createFailedAttack(missMessage, attackResult.d20)
      };
    }

    const { damage, damageRollInfo } = this.calculateDamage(
      newState.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(newState, target, damage);

    // Apply evasion buff
    let bonusDuration = 2;
    if (attack.name === 'Roll') bonusDuration = 3;
    
    ConditionManager.applyCondition(newState.player, 'raise_evasion', bonusDuration, 1);

    let logMessage = `${attack.name} hits ${target.name}! ${damageRollInfo} -> ${damage} damage and evasion raised!`;
    newState.combatLog.push(logMessage);

    if (target.health <= 0) {
      newState.combatLog.push(`${target.name} has been defeated!`);
    }

    this.deductActions(newState, attack.actionCost);
    this.checkCombatEnd(newState);
    this.checkAndEndPlayerTurn(newState);

    return {
      state: newState,
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        bonusEvasion: 3,
        bonusEvasionDuration: bonusDuration,
        message: logMessage,
      }
    };
  }

  /**
   * Execute a single strike (helper for multi-hit attacks)
   * [SERVER RNG] Attack roll, damage roll, condition proc
   */
  private executeSingleStrike(
    state: CombatState,
    target: Enemy,
    attack: WeaponAttack,
    logPrefix: string
  ): { result: AttackResult } {
    if (!attack.weaponData) {
      return {
        result: this.createFailedAttack('No weapon data!')
      };
    }

    const enhancementLevel = attack.enhancementLevel || 0;
    const baseDamage = calculateEnhancedDamage(attack.weaponData, enhancementLevel);
    const multipliedDamage = this.applyDamageMultiplier(baseDamage, attack.damageMultiplier);
    const critThreshold = this.getCritThreshold(attack);
    
    // [SERVER RNG] Attack roll
    const attackResult = this.rollAttackWithBonus(state.player, critThreshold);
    
    const targetEvasion = target.evasion + ConditionManager.getEvasionBonus(target);
    const hit = attackResult.total >= targetEvasion;

    if (!hit) {
      const missMessage = `${logPrefix}: Miss`;
      state.combatLog.push(missMessage);
      return {
        result: {
          hit: false,
          critical: false,
          attackRoll: attackResult.d20,
          damage: 0,
          message: missMessage,
        }
      };
    }

    // [SERVER RNG] Damage calculation
    const { damage, damageRollInfo } = this.calculateDamage(
      state.player,
      multipliedDamage,
      attackResult.critical,
      target,
      attack.name
    );

    target.health = Math.max(0, target.health - damage);
    this.trackDamageToEnemy(state, target, damage);

    const logMessage = `${logPrefix}: Hit for ${damage} damage`;
    state.combatLog.push(logMessage);

    // [SERVER RNG] Condition application
    this.applyConditionFromAttack(state, target, attack);

    return {
      result: {
        hit: true,
        critical: attackResult.critical,
        attackRoll: attackResult.d20,
        damage,
        message: logMessage,
      }
    };
  }

  /**
   * Apply cleave damage to adjacent enemies
   */
  private applyCleave(state: CombatState, primaryTargetIndex: number, primaryDamage: number, cleaveMultiplier: number, attackName: string): void {
    const cleaveDamage = Math.floor(primaryDamage * cleaveMultiplier);
    const otherEnemies = state.enemies.filter((e, i) => i !== primaryTargetIndex && e.health > 0);
    
    if (otherEnemies.length > 0) {
      state.combatLog.push(`${attackName} cleaves through ${otherEnemies.length} other enemies for ${cleaveDamage} damage each!`);
      
      for (const enemy of otherEnemies) {
        enemy.health = Math.max(0, enemy.health - cleaveDamage);
        this.trackDamageToEnemy(state, enemy, cleaveDamage);
        state.combatLog.push(`${enemy.name} takes ${cleaveDamage} cleave damage`);
        
        if (enemy.health <= 0) {
          state.combatLog.push(`${enemy.name} has been defeated!`);
        }
      }
    }
  }

  /**
   * Apply damage multiplier from attack
   */
  private applyDamageMultiplier(baseDamage: DiceRoll, multiplier: number): DiceRoll {
    let adjustedMultiplier = multiplier;
    
    // Backstab multiplier is only on critical hit, not base damage
    if (multiplier === 4) {
      adjustedMultiplier = 1;
    }
    
    if (adjustedMultiplier === 1) return baseDamage;

    return {
      numDice: Math.floor(baseDamage.numDice * adjustedMultiplier),
      dieSize: baseDamage.dieSize,
      modifier: Math.floor(baseDamage.modifier * adjustedMultiplier),
    };
  }

  /**
   * Get critical hit threshold for attack
   */
  private getCritThreshold(attack: WeaponAttack): number {
    if (attack.name === 'Backstab' || attack.name === 'Savage Strike') {
      return 19;
    }
    if (attack.name === 'Crimson Mist') {
      return 18;
    }
    return 20;
  }

  /**
   * Roll attack with player bonuses
   * [SERVER RNG] D20 roll, optional buff bonus roll
   */
  private rollAttackWithBonus(player: PlayerData, critThreshold: number): { d20: number; total: number; critical: boolean } {
    // [SERVER RNG] D20 roll
    const d20 = this.diceRoller.rollD20();
    const attackBonus = player.stats.attackBonus;
    const dependableBonus = ConditionManager.getDependableBonus(player);
    
    // Check for Catriena's Blessing buff (if buffs are in player data)
    let bonusRoll = 0;
    if (player.buffs) {
      const catrienaBuff = player.buffs.find(b => b.type === 'catriena_blessing');
      if (catrienaBuff) {
        // [SERVER RNG] 1d4 bonus roll
        bonusRoll = this.diceRoller.rollD4();
      }
    }

    const weakenedPenalty = ConditionManager.hasCondition(player, 'weakened') ? -2 : 0;

    const total = d20 + attackBonus + dependableBonus + bonusRoll + weakenedPenalty;
    const critical = d20 >= critThreshold;

    return { d20, total, critical };
  }

  /**
   * Calculate damage with all modifiers
   * [SERVER RNG] Damage dice rolls
   */
  private calculateDamage(
    player: PlayerData,
    weaponDamage: DiceRoll,
    isCritical: boolean,
    target: Enemy,
    attackName: string
  ): { damage: number; damageRollInfo: string } {
    let damageBeforeReduction: number;
    let damageRollInfo: string;
    
    // Check for Enraged Spirit buff
    let buffDamageBonus = 0;
    if (player.buffs) {
      const enragedBuff = player.buffs.find(b => b.type === 'enraged_spirit');
      if (enragedBuff) {
        buffDamageBonus = 5;
      }
    }

    if (isCritical) {
      // [SERVER RNG] Critical damage roll
      const critResult = this.diceRoller.rollCriticalDamage(weaponDamage);
      
      // Backstab gets 4x damage on crit (already max dice + extra roll, add 2x more)
      if (attackName === 'Backstab') {
        damageBeforeReduction = (critResult.total * 2) + buffDamageBonus;
        const buffText = buffDamageBonus > 0 ? ` +${buffDamageBonus} (buff)` : '';
        damageRollInfo = `BACKSTAB CRITICAL! ((${critResult.maxDie} + ${critResult.extraRoll} + ${critResult.modifier}) × 2${buffText} = ${damageBeforeReduction})`;
      } else {
        damageBeforeReduction = critResult.total + buffDamageBonus;
        const buffText = buffDamageBonus > 0 ? ` +${buffDamageBonus} (buff)` : '';
        damageRollInfo = `CRITICAL HIT! (${critResult.maxDie} max + ${critResult.extraRoll} roll + ${critResult.modifier}${buffText} = ${damageBeforeReduction})`;
      }
    } else {
      // [SERVER RNG] Normal damage roll
      const damageResult = this.diceRoller.rollDiceTotal(weaponDamage);
      damageBeforeReduction = damageResult.total + buffDamageBonus;
      const rollsStr = damageResult.rolls.join('+');
      const buffText = buffDamageBonus > 0 ? `+${buffDamageBonus}` : '';
      damageRollInfo = `(${rollsStr}+${damageResult.modifier}${buffText ? '+' + buffText : ''} = ${damageBeforeReduction})`;
    }

    // Apply player condition modifiers
    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(player, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(player, 'empowered')) {
      damageMultiplier *= 1.25;
    }

    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    // Apply target damage reduction
    const baseDR = target.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(target);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    return { damage, damageRollInfo };
  }

  /**
   * Apply condition from attack based on proc chance
   * [SERVER RNG] Condition proc roll
   */
  private applyConditionFromAttack(state: CombatState, target: Enemy, attack: WeaponAttack): void {
    if (!attack.conditionInflicted || !attack.conditionChance) {
      return;
    }

    // Mace stun condition is handled differently (doesn't use normal proc)
    if (attack.name === 'Mace' && attack.conditionInflicted === 'stunned') {
      return;
    }

    // [SERVER RNG] Condition proc roll
    if (this.diceRoller.checkPercentage(attack.conditionChance, 'condition proc')) {
      let stacksToApply = 1;
      
      // Hydra's Strike poison intensification
      if (attack.name === 'Hydras Strike' && attack.conditionInflicted === 'poisoned') {
        if (ConditionManager.hasCondition(target, 'poisoned')) {
          stacksToApply = Math.ceil(1 * 1.5);
          state.combatLog.push(`Hydra's venom intensifies on poisoned target! +50% poison stacks!`);
        }
      }
      
      ConditionManager.applyCondition(target, attack.conditionInflicted, attack.conditionDuration || 1, stacksToApply);
      const conditionName = ConditionManager.getConditionDisplayName(attack.conditionInflicted);
      state.combatLog.push(`${target.name} is afflicted with ${conditionName}!`);
    }
  }

  /**
   * Deduct action points from player turn
   */
  private deductActions(state: CombatState, actionCost: number): void {
    state.actionsRemaining -= actionCost;
  }

  /**
   * Check if player turn should end and transition to enemy turn
   */
  private checkAndEndPlayerTurn(state: CombatState): void {
    if (state.actionsRemaining < 1) {
      this.endPlayerTurn(state);
    }
  }

  /**
   * Track damage dealt to enemy (for Greater Void Spawn Chronostep)
   */
  private trackDamageToEnemy(state: CombatState, enemy: Enemy, damage: number): void {
    if (!enemy.damageReceivedHistory) return;
    
    // Simple number tracking - can be enhanced later to track rounds separately
    enemy.damageReceivedHistory.push(damage);
  }

  /**
   * End player turn and transition to enemy turn
   */
  endPlayerTurn(state: CombatState): CombatState {
    const newState = DeepClone.combatState(state);
    
    this.checkCombatEnd(newState);
    if (!newState.isComplete) {
      newState.currentTurn = 'enemy';
    }
    
    return newState;
  }

  /**
   * Start enemy turn - tick poison conditions
   * [SERVER RNG] N/A - poison ticks are deterministic
   */
  enemyTurnStart(state: CombatState): CombatState {
    const newState = DeepClone.combatState(state);

    const aliveEnemies = newState.enemies.filter(e => e.health > 0);
    
    for (const enemy of aliveEnemies) {
      if (ConditionManager.isStunned(enemy)) {
        newState.combatLog.push(`${enemy.name} is stunned and cannot act!`);
        continue;
      }

      // Tick poison at start of enemy turn
      const poisonTick = ConditionManager.tickPoisonOnly(enemy);
      if (poisonTick.damage > 0) {
        enemy.health = Math.max(0, enemy.health - poisonTick.damage);
        poisonTick.messages.forEach(msg => newState.combatLog.push(`[${enemy.name}] ${msg}`));
        
        if (enemy.health <= 0) {
          newState.combatLog.push(`${enemy.name} succumbed to poison!`);
        }
      }
    }
    
    this.checkCombatEnd(newState);
    
    return newState;
  }

  /**
   * Execute enemy turn - each alive enemy attacks or uses special ability
   * [SERVER RNG] Attack rolls, damage rolls, ability proc rolls, special ability RNG
   */
  enemyTurn(state: CombatState): CombatState {
    const newState = DeepClone.combatState(state);

    if (newState.currentTurn !== 'enemy') {
      newState.combatLog.push('Not enemy turn!');
      return newState;
    }

    const aliveEnemies = newState.enemies.filter(e => e.health > 0);

    for (const enemy of aliveEnemies) {
      if (ConditionManager.isStunned(enemy)) {
        continue;
      }

      // Greater Void Spawn - Chronostep ability (70% chance when below 40% HP)
      if (enemy.name === 'Greater Void Spawn' && enemy.chronostepUsesRemaining && enemy.chronostepUsesRemaining > 0) {
        const healthPercent = enemy.health / enemy.maxHealth;
        // [SERVER RNG] Chronostep proc check
        if (healthPercent < 0.4 && this.diceRoller.checkPercentage(70, 'Chronostep proc')) {
          this.useChronostep(newState, enemy);
          continue;
        }
      }

      // Void Spawn - Splooge ability (35% chance)
      if (enemy.name === 'Void Spawn') {
        // [SERVER RNG] Splooge proc check
        if (this.diceRoller.checkPercentage(35, 'Splooge proc')) {
          this.useSplooge(newState, enemy);
          continue;
        }
      }

      // Skitterthid - Poison Barb (35% chance)
      if (enemy.name === 'Skitterthid') {
        // [SERVER RNG] Poison Barb proc check
        if (this.diceRoller.checkPercentage(35, 'Poison Barb proc')) {
          this.usePoisonBarb(newState, enemy);
          continue;
        }
      }

      // Hollow Husk - Agonizing Bite (30% chance)
      if (enemy.name === 'Hollow Husk') {
        // [SERVER RNG] Agonizing Bite proc check
        if (this.diceRoller.checkPercentage(30, 'Agonizing Bite proc')) {
          this.useAgonizingBite(newState, enemy);
          continue;
        }
      }

      // Wailing Wisp - Shrill Touch (40% chance)
      if (enemy.name === 'Wailing Wisp') {
        // [SERVER RNG] Shrill Touch proc check
        if (this.diceRoller.checkPercentage(40, 'Shrill Touch proc')) {
          this.useShrillTouch(newState, enemy);
          continue;
        }
      }

      // Crawley Crow - Shiny Shiny (50% chance, only if hasn't stolen yet)
      if (enemy.name === 'Crawley Crow' && !enemy.itemStolen) {
        // [SERVER RNG] Shiny Shiny proc check
        if (this.diceRoller.checkPercentage(50, 'Shiny Shiny proc')) {
          this.useShinyShiny(newState, enemy);
          continue;
        }
      }

      // Aetherbear - Mighty Roar or Crushing Slam
      if (enemy.name === 'Aetherbear') {
        // [SERVER RNG] Ability selection
        if (this.diceRoller.checkPercentage(25, 'Mighty Roar')) {
          this.useMightyRoar(newState, enemy);
          continue;
        } else if (this.diceRoller.checkPercentage(30, 'Crushing Slam')) {
          this.useCrushingSlam(newState, enemy);
          continue;
        }
      }

      // Standard enemy attack
      this.executeEnemyStandardAttack(newState, enemy);
    }

    this.checkCombatEnd(newState);

    if (!newState.isComplete) {
      newState.currentTurn = 'player';
      if (newState.currentRound !== undefined) {
        newState.currentRound++;
      }
    }

    return newState;
  }

  /**
   * Execute standard enemy attack
   * [SERVER RNG] Attack roll, damage roll
   */
  private executeEnemyStandardAttack(state: CombatState, enemy: Enemy): void {
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    
    // [SERVER RNG] Attack roll
    const attackResult = this.diceRoller.rollAttack(3 + weakenedPenalty);
    const playerEvasion = state.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(state.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} swings and misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty}=${attackResult.total} vs Evasion ${playerEvasion})`;
      state.combatLog.push(missMessage);
      return;
    }

    let damageBeforeReduction: number;
    let damageRollInfo: string;

    if (attackResult.critical) {
      // [SERVER RNG] Critical damage
      const critResult = this.diceRoller.rollCriticalDamage(enemy.damage);
      damageBeforeReduction = critResult.total;
      damageRollInfo = `CRITICAL HIT! (${critResult.maxDie} max + ${critResult.extraRoll} roll + ${critResult.modifier} = ${critResult.total})`;
    } else {
      // [SERVER RNG] Normal damage
      const damageResult = this.diceRoller.rollDiceTotal(enemy.damage);
      damageBeforeReduction = damageResult.total;
      const rollsStr = damageResult.rolls.join('+');
      damageRollInfo = `(${rollsStr}+${damageResult.modifier} = ${damageResult.total})`;
    }

    // Apply enemy condition modifiers
    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    // Apply player damage reduction
    const baseDR = state.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(state.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    state.player.health = Math.max(0, state.player.health - damage);

    let logMessage = `${enemy.name} hits you! ${damageRollInfo}`;
    if (totalDR > 0) {
      logMessage += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction`;
    } else {
      logMessage += ` -> ${damage} damage`;
    }
    
    state.combatLog.push(logMessage);
  }

  /**
   * Enemy Special Abilities
   */

  /**
   * Void Spawn - Splooge: Apply slowed condition for 1d4 rounds
   * [SERVER RNG] D4 roll for duration
   */
  private useSplooge(state: CombatState, enemy: Enemy): void {
    // [SERVER RNG] D4 duration roll
    const duration = this.diceRoller.rollD4();
    
    ConditionManager.applyCondition(state.player, 'slowed', duration, 1);
    
    const message = `${enemy.name} uses Splooge! You're covered in void-touched goo! (Slowed for ${duration} rounds)`;
    state.combatLog.push(message);
  }

  /**
   * Greater Void Spawn - Chronostep: Time reversal healing
   * [SERVER RNG] D4 roll for lookback rounds
   */
  private useChronostep(state: CombatState, enemy: Enemy): void {
    if (!enemy.chronostepUsesRemaining || enemy.chronostepUsesRemaining <= 0) return;
    
    // [SERVER RNG] D4 lookback rounds
    const lookbackRounds = this.diceRoller.rollD4();
    
    let totalHealing = 0;
    if (enemy.damageReceivedHistory) {
      // Take the last N damage entries based on lookback
      const recentDamage = enemy.damageReceivedHistory.slice(-lookbackRounds);
      totalHealing = recentDamage.reduce((sum, dmg) => sum + dmg, 0);
    }
    
    enemy.health = Math.min(enemy.maxHealth, enemy.health + totalHealing);
    enemy.chronostepUsesRemaining--;
    
    const message = `${enemy.name} uses Chronostep! Time reverses ${lookbackRounds} rounds, healing ${totalHealing} HP! (${enemy.chronostepUsesRemaining} uses remaining)`;
    state.combatLog.push(message);
  }

  /**
   * Skitterthid - Poison Barb: Attack that applies 1d4 poison stacks
   * [SERVER RNG] Attack roll, damage roll, D4 poison stacks
   */
  private usePoisonBarb(state: CombatState, enemy: Enemy): void {
    const specialAttackBonus = 2;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    
    // [SERVER RNG] Attack roll
    const attackResult = this.diceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = state.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(state.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Poison Barb but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      state.combatLog.push(missMessage);
      return;
    }

    // [SERVER RNG] Damage roll
    const damageRoll: DiceRoll = { numDice: 1, dieSize: 8, modifier: 2 };
    const damageResult = this.diceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = state.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(state.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    state.player.health = Math.max(0, state.player.health - damage);

    // [SERVER RNG] D4 poison stacks
    const poisonStacks = this.diceRoller.rollD4();
    ConditionManager.applyCondition(state.player, 'poisoned', 3, poisonStacks);

    let message = `${enemy.name} uses Poison Barb! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction and ${poisonStacks} stacks of poison applied!`;
    } else {
      message += ` -> ${damage} damage and ${poisonStacks} stacks of poison applied!`;
    }
    state.combatLog.push(message);
  }

  /**
   * Hollow Husk - Agonizing Bite: Attack that weakens for 1d3 rounds
   * [SERVER RNG] Attack roll, damage roll, D3 duration
   */
  private useAgonizingBite(state: CombatState, enemy: Enemy): void {
    const specialAttackBonus = -1;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    
    // [SERVER RNG] Attack roll
    const attackResult = this.diceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = state.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(state.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Agonizing Bite but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      state.combatLog.push(missMessage);
      return;
    }

    // [SERVER RNG] Damage roll
    const damageRoll: DiceRoll = { numDice: 1, dieSize: 10, modifier: 0 };
    const damageResult = this.diceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = state.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(state.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    state.player.health = Math.max(0, state.player.health - damage);

    // [SERVER RNG] 1d3 duration for weakened
    const weakenedDuration = this.diceRoller.rollDice(1, 3)[0];
    ConditionManager.applyCondition(state.player, 'weakened', weakenedDuration, 1);

    let message = `${enemy.name} uses Agonizing Bite! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction and weakened for ${weakenedDuration} rounds!`;
    } else {
      message += ` -> ${damage} damage and weakened for ${weakenedDuration} rounds!`;
    }
    state.combatLog.push(message);
  }

  /**
   * Wailing Wisp - Shrill Touch: Attack that applies 1d2 poison stacks
   * [SERVER RNG] Attack roll, damage roll, D2 poison stacks
   */
  private useShrillTouch(state: CombatState, enemy: Enemy): void {
    const specialAttackBonus = 2;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    
    // [SERVER RNG] Attack roll
    const attackResult = this.diceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = state.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(state.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Shrill Touch but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      state.combatLog.push(missMessage);
      return;
    }

    // [SERVER RNG] Damage roll
    const damageRoll: DiceRoll = { numDice: 2, dieSize: 4, modifier: 2 };
    const damageResult = this.diceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = state.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(state.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    state.player.health = Math.max(0, state.player.health - damage);

    // [SERVER RNG] 1d2 poison stacks
    const poisonStacks = this.diceRoller.rollDice(1, 2)[0];
    ConditionManager.applyCondition(state.player, 'poisoned', 3, poisonStacks);

    let message = `${enemy.name} uses Shrill Touch! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction and ${poisonStacks} stacks of poison applied!`;
    } else {
      message += ` -> ${damage} damage and ${poisonStacks} stacks of poison applied!`;
    }
    state.combatLog.push(message);
  }

  /**
   * Crawley Crow - Shiny Shiny: Steal random item and attempt flee
   * [SERVER RNG] Attack roll, random item selection, D20 flee roll
   */
  private useShinyShiny(state: CombatState, enemy: Enemy): void {
    const specialAttackBonus = 1;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    
    // [SERVER RNG] Attack roll
    const attackResult = this.diceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = state.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(state.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} tries Shiny Shiny but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      state.combatLog.push(missMessage);
      return;
    }

    const inventoryItems = state.player.inventory.filter(item => item.quantity > 0);
    
    if (inventoryItems.length === 0) {
      const noItemMessage = `${enemy.name} uses Shiny Shiny but you have no items to steal!`;
      state.combatLog.push(noItemMessage);
      return;
    }

    // [SERVER RNG] Random item selection
    const randomIndex = this.diceRoller.randomInt(0, inventoryItems.length - 1, 'stolen item');
    const stolenItem = inventoryItems[randomIndex];
    // We can't get item name from ItemDatabase on server, use itemId
    const itemName = stolenItem.itemId;

    if (stolenItem.quantity > 1) {
      stolenItem.quantity -= 1;
    } else {
      const inventoryIndex = state.player.inventory.indexOf(stolenItem);
      if (inventoryIndex > -1) {
        state.player.inventory.splice(inventoryIndex, 1);
      }
    }

    enemy.itemStolen = true;

    const stealMessage = `${enemy.name} uses Shiny Shiny! Stole ${itemName} from your inventory!`;
    state.combatLog.push(stealMessage);

    // [SERVER RNG] D20 flee roll
    const fleeTarget = 12 + state.player.level;
    const fleeRoll = this.diceRoller.rollD20();

    if (fleeRoll > fleeTarget) {
      const fleeMessage = `${enemy.name} flees with the stolen item! (Rolled ${fleeRoll} vs ${fleeTarget}) Combat ends!`;
      state.combatLog.push(fleeMessage);
      
      enemy.health = 0;
      this.checkCombatEnd(state);
    } else {
      const failMessage = `${enemy.name} tries to flee but is stuck in combat! (Rolled ${fleeRoll} vs ${fleeTarget})`;
      state.combatLog.push(failMessage);
    }
  }

  /**
   * Aetherbear - Mighty Roar: Self-buff with empowered
   * [SERVER RNG] D4+2 duration roll
   */
  private useMightyRoar(state: CombatState, enemy: Enemy): void {
    // [SERVER RNG] D4+2 duration
    const duration = this.diceRoller.rollD4() + 2;
    
    ConditionManager.applyCondition(enemy, 'empowered', duration, 1);
    
    const message = `${enemy.name} uses Mighty Roar! Gains empowered status for ${duration} rounds!`;
    state.combatLog.push(message);
  }

  /**
   * Aetherbear - Crushing Slam: Heavy attack with potential stun
   * [SERVER RNG] Attack roll, damage roll, 15% player stun proc, 25% self-stun on miss
   */
  private useCrushingSlam(state: CombatState, enemy: Enemy): void {
    const specialAttackBonus = 3;
    const weakenedPenalty = ConditionManager.hasCondition(enemy, 'weakened') ? -2 : 0;
    
    // [SERVER RNG] Attack roll
    const attackResult = this.diceRoller.rollAttack(3 + weakenedPenalty + specialAttackBonus);
    const playerEvasion = state.player.stats.calculatedEvasion + 
                          ConditionManager.getEvasionBonus(state.player);
    const hit = attackResult.total >= playerEvasion;

    if (!hit) {
      const missMessage = `${enemy.name} uses Crushing Slam but misses! (Rolled ${attackResult.d20}+${3 + weakenedPenalty + specialAttackBonus}=${attackResult.total} vs Evasion ${playerEvasion})`;
      state.combatLog.push(missMessage);
      
      // [SERVER RNG] 25% self-stun on miss
      if (this.diceRoller.checkPercentage(25, 'Crushing Slam self-stun')) {
        ConditionManager.applyCondition(enemy, 'stunned', 1, 1);
        const selfStunMessage = `${enemy.name} loses balance and is stunned for 1 round!`;
        state.combatLog.push(selfStunMessage);
      }
      
      return;
    }

    // [SERVER RNG] Damage roll
    const damageRoll: DiceRoll = { numDice: 3, dieSize: 8, modifier: 4 };
    const damageResult = this.diceRoller.rollDiceTotal(damageRoll);
    let damageBeforeReduction = damageResult.total;

    let damageMultiplier = 1.0;
    if (ConditionManager.hasCondition(enemy, 'weakened')) {
      damageMultiplier *= 0.9;
    }
    if (ConditionManager.hasCondition(enemy, 'empowered')) {
      damageMultiplier *= 1.25;
    }
    
    damageBeforeReduction = Math.floor(damageBeforeReduction * damageMultiplier);

    const baseDR = state.player.stats.damageReduction;
    const bonusDR = ConditionManager.getDamageReductionBonus(state.player);
    const totalDR = Math.min(baseDR + bonusDR, 0.95);
    
    const damage = Math.max(1, Math.floor(damageBeforeReduction * (1 - totalDR)));

    state.player.health = Math.max(0, state.player.health - damage);

    let message = `${enemy.name} uses Crushing Slam! (${damageResult.rolls.join('+')}+${damageResult.modifier} = ${damageBeforeReduction})`;
    if (totalDR > 0) {
      message += ` -> ${damage} damage after ${Math.floor(totalDR * 100)}% reduction!`;
    } else {
      message += ` -> ${damage} damage!`;
    }
    
    // [SERVER RNG] 15% player stun proc
    if (this.diceRoller.checkPercentage(15, 'Crushing Slam player stun')) {
      ConditionManager.applyCondition(state.player, 'stunned', 1, 1);
      message += ' You are stunned for 1 round!';
    }
    
    state.combatLog.push(message);
  }

  /**
   * End enemy turn - tick bleeding conditions
   */
  enemyTurnEnd(state: CombatState): CombatState {
    const newState = DeepClone.combatState(state);

    const aliveEnemies = newState.enemies.filter(e => e.health > 0);
    
    for (const enemy of aliveEnemies) {
      const bleedTick = ConditionManager.tickBleedingOnly(enemy);
      if (bleedTick.damage > 0) {
        enemy.health = Math.max(0, enemy.health - bleedTick.damage);
        bleedTick.messages.forEach(msg => newState.combatLog.push(`[${enemy.name}] ${msg}`));
        
        if (enemy.health <= 0) {
          newState.combatLog.push(`${enemy.name} bled out!`);
        }
      }
    }
    
    this.checkCombatEnd(newState);
    
    return newState;
  }

  /**
   * Check if combat should end (all enemies dead or player dead)
   */
  private checkCombatEnd(state: CombatState): void {
    const allEnemiesDead = state.enemies.every(e => e.health <= 0);
    const playerDead = state.player.health <= 0;

    if (allEnemiesDead) {
      state.isComplete = true;
      state.playerVictory = true;
      state.combatLog.push('Victory! All enemies defeated!');
    } else if (playerDead) {
      state.isComplete = true;
      state.playerVictory = false;
      state.combatLog.push('You have been defeated...');
    }
  }

  /**
   * Helper to create a failed attack result
   */
  private createFailedAttack(message: string, attackRoll: number = 0): AttackResult {
    return {
      hit: false,
      critical: false,
      attackRoll,
      damage: 0,
      message,
    };
  }

  /**
   * Get current combat state (for inspection)
   */
  getCombatState(state: CombatState): CombatState {
    return state;
  }

  /**
   * Check if it's player's turn
   */
  isPlayerTurn(state: CombatState): boolean {
    return state.currentTurn === 'player' && !state.isComplete;
  }

  /**
   * Check if combat is complete
   */
  isCombatComplete(state: CombatState): boolean {
    return state.isComplete;
  }
}
