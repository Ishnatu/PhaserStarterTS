export type WeaponSlot = 'mainHand' | 'offHand';
export type ArmorSlot = 'helmet' | 'chest' | 'legs' | 'boots' | 'shoulders' | 'cape';
export type EquipmentSlot = WeaponSlot | ArmorSlot;

export type WeaponType = 'dagger' | 'shortsword' | 'longsword' | 'battleaxe' | 'mace' | 'warhammer' | 
                         'greatsword' | 'greataxe' | 'staff' | 'spear' | 'rapier';
export type ArmorType = 'light' | 'heavy' | 'shield';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

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
}

export interface EquippedItem {
  itemId: string;
  enhancementLevel?: number;
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
  position: { x: number; y: number };
  inventory: InventoryItem[];
  footlocker: InventoryItem[];
  equipment: PlayerEquipment;
  stats: PlayerStats;
  arcaneAsh: number;
  crystallineAnimus: number;
  level: number;
  experience: number;
  inventorySlots: number;
  footlockerSlots: number;
  activeBuffs: PlayerBuff[];
  exploredTiles: string[];
}

export interface DelveRoom {
  id: string;
  type: 'combat' | 'puzzle' | 'trap' | 'boss' | 'treasure';
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

export interface Enemy {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  evasion: number;
  damageReduction: number;
  weaponDamage: DiceRoll;
  lootTable: { itemId: string; dropChance: number }[];
}

export interface AttackResult {
  hit: boolean;
  critical: boolean;
  attackRoll: number;
  damage: number;
  damageBeforeReduction: number;
  message: string;
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
}

export type GameScene = 'town' | 'explore' | 'delve' | 'combat';

export type EncounterType = 'combat' | 'treasure' | 'event' | 'nothing';

export interface Encounter {
  type: EncounterType;
  description: string;
  enemies?: Enemy[];
  loot?: { aa: number; ca: number; items?: InventoryItem[] };
}

export interface GameState {
  currentScene: GameScene;
  player: PlayerData;
  currentDelve?: Delve;
  combatState?: CombatState;
  explorePosition: { x: number; y: number };
  discoveredDelves: { x: number; y: number; tier: number }[];
}
