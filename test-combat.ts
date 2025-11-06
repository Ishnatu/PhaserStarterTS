import { CombatSystem } from './src/systems/CombatSystem';
import { WeaponAttackDatabase } from './src/config/WeaponAttackDatabase';
import { EnemyFactory } from './src/systems/EnemyFactory';
import { PlayerData, Enemy, CombatState } from './src/types/GameTypes';
import { ItemDatabase } from './src/config/ItemDatabase';

// Initialize ItemDatabase
ItemDatabase.initialize();

// Create a test player with all equipment slots filled
function createTestPlayer(): PlayerData {
  const allWeapons = ItemDatabase.getAllWeapons();
  const battleaxe = allWeapons.find(w => w.type === 'battleaxe')!;
  const scythe = allWeapons.find(w => w.type === 'scythe')!;
  const dagger = allWeapons.find(w => w.type === 'dagger')!;
  const mace = allWeapons.find(w => w.type === 'mace')!;

  return {
    id: 'test-player',
    username: 'TestHero',
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    level: 5,
    experience: 0,
    currency: { arcaneAsh: 1000, crystallineAnimus: 100 },
    equipment: {
      mainHand: { ...battleaxe, enhancementLevel: 0, durability: 100, maxDurability: 100 },
      offHand: null,
      head: null,
      chest: null,
      legs: null,
      feet: null,
      hands: null,
      accessory: null,
    },
    inventory: [],
    footlocker: [],
    currentLocation: { x: 0, y: 0 },
    exploredTiles: new Set(),
    completedDelves: new Set(),
    statusConditions: [],
    activeBuffs: [],
    wildernessRestsRemaining: 2,
    lastRestTimestamp: 0,
    karmaPoints: 0,
    soulboundSlots: [],
  };
}

// Create test enemies
function createTestEnemies(count: number, tier: number): Enemy[] {
  const enemies: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    enemies.push(EnemyFactory.createEnemy(tier, false));
  }
  return enemies;
}

// Test framework
class CombatTester {
  private combatSystem: CombatSystem;
  private testResults: { weapon: string; attack: string; result: string; success: boolean }[] = [];

  constructor() {
    this.combatSystem = new CombatSystem();
  }

  private setupCombat(player: PlayerData, enemies: Enemy[]): CombatState {
    return {
      player,
      enemies,
      currentTurn: 'player' as const,
      combatLog: [],
      actionsRemaining: 2,
      maxActionsPerTurn: 2,
      currentScene: 'combat',
    };
  }

  private resetPlayer(player: PlayerData): void {
    player.health = player.maxHealth;
    player.stamina = player.maxStamina;
    player.statusConditions = [];
  }

  testAttack(weaponType: string, attackName: string, enemyCount: number = 1, tier: number = 1): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${weaponType} - ${attackName}`);
    console.log(`${'='.repeat(60)}`);

    const player = createTestPlayer();
    const weapon = ItemDatabase.getAllWeapons().find(w => w.type === weaponType.toLowerCase());
    
    if (!weapon) {
      this.testResults.push({ weapon: weaponType, attack: attackName, result: 'Weapon not found', success: false });
      console.log(`❌ FAILED: Weapon type ${weaponType} not found`);
      return;
    }

    player.equipment.mainHand = { ...weapon, enhancementLevel: 0, durability: 100, maxDurability: 100 };
    const enemies = createTestEnemies(enemyCount, tier);
    this.combatSystem.initiateCombat(player, enemies, false);

    const attacks = WeaponAttackDatabase.getAttacksForWeapon(weaponType as any);
    const attack = attacks.find(a => a.name === attackName);
    
    if (!attack) {
      this.testResults.push({ weapon: weaponType, attack: attackName, result: 'Attack not found', success: false });
      console.log(`❌ FAILED: Attack ${attackName} not found for ${weaponType}`);
      return;
    }

    console.log(`Initial State:`);
    console.log(`  Player: ${player.health}/${player.maxHealth} HP, ${player.stamina}/${player.maxStamina} Stamina`);
    enemies.forEach((e, i) => console.log(`  Enemy ${i + 1}: ${e.name} - ${e.health}/${e.maxHealth} HP`));

    const result = this.combatSystem.playerAttack(0, attack);
    
    console.log(`\nAttack Result:`);
    console.log(`  Hit: ${result.hit}`);
    console.log(`  Critical: ${result.critical}`);
    console.log(`  Damage: ${result.damage}`);
    console.log(`  Message: ${result.message}`);
    
    const currentState = this.combatSystem.getCombatState();
    if (currentState) {
      console.log(`\nPost-Attack State:`);
      console.log(`  Player: ${currentState.player.health}/${currentState.player.maxHealth} HP, ${currentState.player.stamina}/${currentState.player.maxStamina} Stamina`);
      currentState.enemies.forEach((e, i) => console.log(`  Enemy ${i + 1}: ${e.name} - ${e.health}/${e.maxHealth} HP`));
      
      console.log(`\nCombat Log:`);
      currentState.combatLog.forEach(log => console.log(`  - ${log}`));

      const success = result.hit !== undefined;
      this.testResults.push({ 
        weapon: weaponType, 
        attack: attackName, 
        result: result.message, 
        success 
      });
      console.log(`\n${success ? '✅ PASSED' : '❌ FAILED'}`);
    }
  }

  testDualWield(mainWeapon: string, offWeapon: string, attackName: string): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing DUAL-WIELD: ${mainWeapon} + ${offWeapon} - ${attackName}`);
    console.log(`${'='.repeat(60)}`);

    const player = createTestPlayer();
    const allWeapons = ItemDatabase.getAllWeapons();
    const main = allWeapons.find(w => w.type === mainWeapon.toLowerCase());
    const off = allWeapons.find(w => w.type === offWeapon.toLowerCase());
    
    if (!main || !off) {
      console.log(`❌ FAILED: Weapons not found`);
      return;
    }

    player.equipment.mainHand = { ...main, enhancementLevel: 0, durability: 100, maxDurability: 100 };
    player.equipment.offHand = { ...off, enhancementLevel: 0, durability: 100, maxDurability: 100 };
    
    const enemies = createTestEnemies(2, 1);
    this.combatSystem.initiateCombat(player, enemies, false);

    const attacks = WeaponAttackDatabase.getAttacksForWeapon(mainWeapon as any);
    const attack = attacks.find(a => a.name === attackName);
    
    if (!attack) {
      console.log(`❌ FAILED: Attack not found`);
      return;
    }

    console.log(`Initial State:`);
    console.log(`  Player: ${player.health}/${player.maxHealth} HP, ${player.stamina}/${player.maxStamina} Stamina`);
    enemies.forEach((e, i) => console.log(`  Enemy ${i + 1}: ${e.name} - ${e.health}/${e.maxHealth} HP`));

    const result = this.combatSystem.playerAttack(0, attack);
    
    const currentState = this.combatSystem.getCombatState();
    if (currentState) {
      console.log(`\nPost-Attack State:`);
      currentState.enemies.forEach((e, i) => console.log(`  Enemy ${i + 1}: ${e.name} - ${e.health}/${e.maxHealth} HP`));
      
      console.log(`\nCombat Log:`);
      currentState.combatLog.forEach(log => console.log(`  - ${log}`));
      console.log(`\n✅ DUAL-WIELD TEST COMPLETE`);
    }
  }

  printSummary(): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    
    const passed = this.testResults.filter(r => r.success).length;
    const failed = this.testResults.filter(r => !r.success).length;
    
    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log(`\nFailed Tests:`);
      this.testResults.filter(r => !r.success).forEach(r => {
        console.log(`  ❌ ${r.weapon} - ${r.attack}: ${r.result}`);
      });
    }
  }
}

// Run all tests
console.log('🎮 GEMFORGE CHRONICLES - COMBAT SYSTEM TEST SUITE 🎮\n');

const tester = new CombatTester();

// Test Dagger
tester.testAttack('dagger', 'Light Attack');
tester.testAttack('dagger', 'Backstab');

// Test Rapier
tester.testAttack('rapier', 'Light Attack');
tester.testAttack('rapier', 'Puncture'); // 3-hit attack
tester.testAttack('rapier', 'Vipers Fangs');

// Test Battleaxe
tester.testAttack('battleaxe', 'Rend');
tester.testAttack('battleaxe', 'Heavy Swing');
tester.testAttack('battleaxe', 'Sweeping Strike', 2); // Cleave attack

// Test Longsword
tester.testAttack('longsword', 'Light Attack');
tester.testAttack('longsword', 'Sweeping Strike', 2); // Cleave attack

// Test Scythe
tester.testAttack('scythe', 'Reap');
tester.testAttack('scythe', 'Sweeping Rend', 2); // Cleave attack
tester.testAttack('scythe', 'Murderous Intent', 3); // Cleave attack with 3 enemies

// Test Mace
tester.testAttack('mace', 'Light Attack');
tester.testAttack('mace', 'Mace'); // Stun attack
tester.testAttack('mace', 'Savage Strike');

// Test Greatsword
tester.testAttack('greatsword', 'Light Attack');
tester.testAttack('greatsword', 'Arcing Blade', 3); // AoE
tester.testAttack('greatsword', 'Spinning Flurry', 3); // AoE

// Test Dual Blades
tester.testAttack('dualblades', 'Light Attack');
tester.testAttack('dualblades', 'Crimson Mist', 2); // AoE vampiric
tester.testAttack('dualblades', 'Bloodfury');

// Test Dual-Wield Cleave
tester.testDualWield('battleaxe', 'dagger', 'Sweeping Strike');

tester.printSummary();
