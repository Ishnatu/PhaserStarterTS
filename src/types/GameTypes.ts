export interface PlayerData {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  position: { x: number; y: number };
  inventory: InventoryItem[];
  equipment: Equipment;
  arcaneAsh: number;
  crystallineAnimus: number;
  level: number;
  experience: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'consumable' | 'material' | 'gem' | 'equipment';
  quantity: number;
  description: string;
  soulbound: boolean;
}

export interface Equipment {
  weapon?: EquipmentItem;
  armor?: EquipmentItem;
  accessory?: EquipmentItem;
}

export interface EquipmentItem {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory';
  tier: number;
  shiny: boolean;
  stats: {
    attack?: number;
    defense?: number;
    speed?: number;
  };
  soulbound: boolean;
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
  attack: number;
  defense: number;
  speed: number;
  lootTable: { itemId: string; dropChance: number }[];
}

export interface CombatState {
  player: PlayerData;
  enemies: Enemy[];
  currentTurn: 'player' | 'enemy';
  currentEnemyIndex: number;
  combatLog: string[];
  isComplete: boolean;
  playerVictory: boolean;
}

export type GameScene = 'town' | 'explore' | 'delve' | 'combat';

export type EncounterType = 'combat' | 'treasure' | 'event' | 'nothing';

export interface Encounter {
  type: EncounterType;
  description: string;
  enemies?: Enemy[];
  loot?: { aa: number; ca: number };
}

export interface GameState {
  currentScene: GameScene;
  player: PlayerData;
  currentDelve?: Delve;
  combatState?: CombatState;
  explorePosition: { x: number; y: number };
  discoveredDelves: { x: number; y: number; tier: number }[];
}
