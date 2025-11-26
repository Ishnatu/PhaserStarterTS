export type WeaponSlot = 'mainHand' | 'offHand';
export type ArmorSlot = 'helmet' | 'chest' | 'legs' | 'boots' | 'shoulders' | 'cape';
export type EquipmentSlot = WeaponSlot | ArmorSlot;

export type WeaponType = 'dagger' | 'shortsword' | 'longsword' | 'battleaxe' | 'mace' | 'warhammer' | 
                         'greatsword' | 'greataxe' | 'staff' | 'spear' | 'rapier' | 'quarterstaff' | 'unarmed';
export type ShieldType = 'steel_shield' | 'leather_shield';
export type ArmorType = 'light' | 'heavy' | 'shield';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type StatusConditionType = 'bleeding' | 'stunned' | 'poisoned' | 'dependable' | 'raise_evasion' | 'raise_defence' | 'vampiric' | 'decapitate' | 'slowed' | 'weakened' | 'empowered' | 'choke';

export interface StatusCondition {
  type: StatusConditionType;
  stacks: number;
  duration: number;
}

export interface WeaponAttack {
  name: string;
  actionCost: number;
  staminaCost: number;
  damageMultiplier: number;
  hitBonus: number;
  conditionInflicted?: StatusConditionType;
  conditionChance?: number;
  conditionDuration?: number;
  specialEffect?: string;
  cleave?: number;
  availableWithShield: boolean;
  requiresDualWield: boolean;
  requiresBothHandsFree?: boolean;
  sourceHand?: WeaponSlot;
  weaponData?: WeaponData;
  enhancementLevel?: number;
  baseDamage?: DiceRoll;
}

export interface DiceRoll {
  numDice: number;
  dieSize: number;
  modifier: number;
}

export interface WeaponData {
  id: string;
  name: string;
  type: WeaponType;
  damage: DiceRoll;
  twoHanded: boolean;
  rarity: ItemRarity;
  description: string;
}

export interface ArmorData {
  id: string;
  name: string;
  slot: ArmorSlot | 'shield';
  armorType: ArmorType;
  evasionModifier: number;
  damageReduction: number;
  rarity: ItemRarity;
  description: string;
}

export interface PotionData {
  id: string;
  name: string;
  type: 'health' | 'stamina';
  restoration: DiceRoll;
  rarity: ItemRarity;
  description: string;
}

export type ItemData = WeaponData | ArmorData | PotionData;

export interface InventoryItem {
  itemId: string;
  quantity: number;
  enhancementLevel?: number;
  durability?: number;
  maxDurability?: number;
  isShiny?: boolean;
}

export interface EquippedItem {
  itemId: string;
  enhancementLevel?: number;
  durability?: number;
  maxDurability?: number;
  isShiny?: boolean;
}

export interface PlayerEquipment {
  mainHand?: EquippedItem;
  offHand?: EquippedItem;
  helmet?: EquippedItem;
  chest?: EquippedItem;
  legs?: EquippedItem;
  boots?: EquippedItem;
  shoulders?: EquippedItem;
  cape?: EquippedItem;
}

export interface PlayerStats {
  baseEvasion: number;
  calculatedEvasion: number;
  damageReduction: number;
  attackBonus: number;
  damageBonus: number;
}

export type BuffType = 'enraged_spirit' | 'catriena_blessing' | 'aroma_of_void';

export interface PlayerBuff {
  type: BuffType;
  name: string;
  description: string;
  expiresAt?: number;
  expiresOnTownReturn?: boolean;
}

export interface PlayerData {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  experience: number;
  level: number;
  arcaneAsh: number;
  crystallineAnimus: number;
  inventory: InventoryItem[];
  footlocker: InventoryItem[];
  equipment: PlayerEquipment;
  stats: PlayerStats;
  statusConditions: StatusCondition[];
  buffs?: PlayerBuff[];
  karma?: number;
}

export interface Enemy {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  evasion: number;
  damageReduction: number;
  attackBonus: number;
  damage: DiceRoll;
  weaponType: WeaponType;
  statusConditions: StatusCondition[];
  tier: number;
  isBoss: boolean;
  backstabUsed?: boolean;
  chronostepUsesRemaining?: number;
  damageReceivedHistory?: number[];
  itemStolen?: boolean;
}

export interface AttackResult {
  hit: boolean;
  critical: boolean;
  attackRoll: number;
  damage: number;
  targetHealth?: number;
  targetDefeated?: boolean;
  conditionApplied?: StatusConditionType;
  message?: string;
  healing?: number;
  bonusEvasion?: number;
  bonusEvasionDuration?: number;
}

export interface CombatState {
  player: PlayerData;
  enemies: Enemy[];
  currentTurn: 'player' | 'enemy';
  currentEnemyIndex: number;
  combatLog: string[];
  isComplete: boolean;
  playerVictory: boolean;
  isWildEncounter: boolean;
  actionsRemaining: number;
  maxActionsPerTurn: number;
  currentRound: number;
  turnStartProcessed?: boolean;
}

export interface DelveRoom {
  id: string;
  type: 'combat' | 'puzzle' | 'trap' | 'boss' | 'treasure' | '???';
  completed: boolean;
  connections: string[];
  enemyIds?: string[];
  loot?: InventoryItem[];
}

export interface Delve {
  id: string;
  tier: number;
  rooms: Map<string, DelveRoom>;
  currentRoomId: string;
  entranceRoomId: string;
  bossRoomId: string;
  location?: { x: number; y: number };
}
