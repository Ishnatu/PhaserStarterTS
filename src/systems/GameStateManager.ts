import { GameState, PlayerData, GameScene } from '../types/GameTypes';
import { GameConfig } from '../config/GameConfig';
import { EquipmentManager } from './EquipmentManager';
import { ApiClient } from '../utils/ApiClient';
import { ItemDatabase } from '../config/ItemDatabase';
import { generateStarterKitItems } from '../config/StarterKit';

export class GameStateManager {
  private static instance: GameStateManager;
  private gameState: GameState;
  private autoSaveInterval?: number;
  private initialized: boolean = false;

  private constructor() {
    this.gameState = this.createInitialState();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  markInitialized(): void {
    this.initialized = true;
  }

  static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  private exploredTilesSet: Set<string> = new Set();

  private migrateDurabilitySystem(): void {
    const player = this.gameState.player;
    
    // Migrate inventory items
    player.inventory.forEach(item => {
      if (item.durability === undefined) {
        const weapon = ItemDatabase.getWeapon(item.itemId);
        const armor = ItemDatabase.getArmor(item.itemId);
        
        if (weapon || armor) {
          const enhancementLevel = item.enhancementLevel || 0;
          const maxDurability = 100 + (enhancementLevel * 10);
          item.durability = maxDurability;
          item.maxDurability = maxDurability;
        }
      }
    });
    
    // Migrate footlocker items
    player.footlocker.forEach(item => {
      if (item.durability === undefined) {
        const weapon = ItemDatabase.getWeapon(item.itemId);
        const armor = ItemDatabase.getArmor(item.itemId);
        
        if (weapon || armor) {
          const enhancementLevel = item.enhancementLevel || 0;
          const maxDurability = 100 + (enhancementLevel * 10);
          item.durability = maxDurability;
          item.maxDurability = maxDurability;
        }
      }
    });
    
    // Migrate equipped items
    const equipmentSlots: Array<keyof typeof player.equipment> = [
      'mainHand', 'offHand', 'helmet', 'chest', 'legs', 'boots', 'shoulders', 'cape'
    ];
    
    equipmentSlots.forEach(slot => {
      const equipped = player.equipment[slot];
      if (equipped && equipped.durability === undefined) {
        const enhancementLevel = equipped.enhancementLevel || 0;
        const maxDurability = 100 + (enhancementLevel * 10);
        equipped.durability = maxDurability;
        equipped.maxDurability = maxDurability;
      }
    });
    
    // Migrate rest tracking system
    if (player.wildernessRestsRemaining === undefined) {
      player.wildernessRestsRemaining = GameConfig.STAMINA.MAX_WILDERNESS_RESTS;
    }
    if (player.lastRestTimestamp === undefined) {
      player.lastRestTimestamp = 0;
    }
    if (!player.statusConditions) {
      player.statusConditions = [];
    }
  }

  private createInitialState(): GameState {
    const starterKitItems = generateStarterKitItems();
    
    const player: PlayerData = {
      health: GameConfig.PLAYER.STARTING_HEALTH,
      maxHealth: GameConfig.PLAYER.STARTING_HEALTH,
      stamina: GameConfig.PLAYER.STARTING_STAMINA,
      maxStamina: GameConfig.PLAYER.STARTING_STAMINA,
      position: { x: 0, y: 0 },
      inventory: [],
      footlocker: starterKitItems,
      equipment: {},
      stats: {
        baseEvasion: 10,
        calculatedEvasion: 10,
        damageReduction: 0,
        attackBonus: 3,
        damageBonus: 3,
      },
      arcaneAsh: GameConfig.PLAYER.STARTING_AA,
      crystallineAnimus: GameConfig.PLAYER.STARTING_CA,
      level: GameConfig.PLAYER.STARTING_LEVEL,
      experience: 0,
      inventorySlots: 15,
      footlockerSlots: 80,
      activeBuffs: [],
      exploredTiles: [],
      completedDelves: [],
      statusConditions: [],
      wildernessRestsRemaining: GameConfig.STAMINA.MAX_WILDERNESS_RESTS,
      lastRestTimestamp: 0,
      hasReceivedStarterKit: true,
      isNewPlayer: true,
    };
    this.exploredTilesSet = new Set();

    player.stats = EquipmentManager.calculatePlayerStats(player);

    return {
      currentScene: 'town',
      player,
      explorePosition: { x: 50, y: 50 },
      discoveredDelves: [],
    };
  }

  getState(): GameState {
    return this.gameState;
  }

  getPlayer(): PlayerData {
    return this.gameState.player;
  }

  setScene(scene: GameScene): void {
    this.gameState.currentScene = scene;
  }

  getCurrentScene(): GameScene {
    return this.gameState.currentScene;
  }

  updatePlayer(updates: Partial<PlayerData>): void {
    this.gameState.player = { ...this.gameState.player, ...updates };
    this.gameState.player.stats = EquipmentManager.calculatePlayerStats(this.gameState.player);
  }

  addArcaneAsh(amount: number): void {
    this.gameState.player.arcaneAsh += amount;
  }

  addCrystallineAnimus(amount: number): void {
    this.gameState.player.crystallineAnimus += amount;
  }

  spendArcaneAsh(amount: number): boolean {
    if (this.gameState.player.arcaneAsh >= amount) {
      this.gameState.player.arcaneAsh -= amount;
      return true;
    }
    return false;
  }

  spendCrystallineAnimus(amount: number): boolean {
    if (this.gameState.player.crystallineAnimus >= amount) {
      this.gameState.player.crystallineAnimus -= amount;
      return true;
    }
    return false;
  }

  loadFromObject(data: any): void {
    this.gameState = data;
    this.gameState.player.stats = EquipmentManager.calculatePlayerStats(this.gameState.player);
    this.exploredTilesSet = new Set(this.gameState.player.exploredTiles || []);
    if (!this.gameState.player.completedDelves) {
      this.gameState.player.completedDelves = [];
    }
    this.migrateDurabilitySystem();
  }

  async saveToServer(): Promise<boolean> {
    this.gameState.player.exploredTiles = Array.from(this.exploredTilesSet);
    return await ApiClient.saveGame(this.gameState);
  }

  enableAutoSave(intervalSeconds: number = 30): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    this.autoSaveInterval = window.setInterval(async () => {
      const saved = await this.saveToServer();
      if (saved) {
        console.log('Auto-save successful');
      }
    }, intervalSeconds * 1000);
  }

  disableAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = undefined;
    }
  }

  resetGame(): void {
    this.gameState = this.createInitialState();
    this.exploredTilesSet = new Set();
    this.disableAutoSave();
  }

  addItemToInventory(
    itemId: string, 
    quantity: number = 1, 
    enhancementLevel?: number,
    durability?: number,
    maxDurability?: number,
    isShiny?: boolean
  ): boolean {
    const totalItems = this.gameState.player.inventory.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItems + quantity > this.gameState.player.inventorySlots) {
      return false;
    }

    // Check if item is a potion (stackable)
    const potion = ItemDatabase.getPotion(itemId);
    if (potion) {
      const existing = this.gameState.player.inventory.find(item => item.itemId === itemId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        this.gameState.player.inventory.push({ itemId, quantity });
      }
      return true;
    }

    // For weapons/armor, each item gets its own durability
    const finalEnhancementLevel = enhancementLevel || 0;
    const finalMaxDurability = maxDurability ?? (100 + (finalEnhancementLevel * 10));
    const finalDurability = durability ?? finalMaxDurability;
    
    this.gameState.player.inventory.push({ 
      itemId, 
      quantity, 
      enhancementLevel: finalEnhancementLevel,
      durability: finalDurability,
      maxDurability: finalMaxDurability,
      isShiny: isShiny
    });
    return true;
  }

  removeItemFromInventory(itemId: string, quantity: number = 1): boolean {
    const existing = this.gameState.player.inventory.find(item => item.itemId === itemId);
    if (!existing || existing.quantity < quantity) {
      return false;
    }

    existing.quantity -= quantity;
    if (existing.quantity === 0) {
      this.gameState.player.inventory = this.gameState.player.inventory.filter(item => item.itemId !== itemId);
    }
    return true;
  }

  moveToFootlocker(itemId: string, quantity: number = 1): boolean {
    if (!this.removeItemFromInventory(itemId, quantity)) {
      return false;
    }

    const totalItems = this.gameState.player.footlocker.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItems + quantity > this.gameState.player.footlockerSlots) {
      this.addItemToInventory(itemId, quantity);
      return false;
    }

    const existing = this.gameState.player.footlocker.find(item => item.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.gameState.player.footlocker.push({ itemId, quantity });
    }
    return true;
  }

  moveFromFootlocker(itemId: string, quantity: number = 1): boolean {
    const existing = this.gameState.player.footlocker.find(item => item.itemId === itemId);
    if (!existing || existing.quantity < quantity) {
      return false;
    }

    if (!this.addItemToInventory(itemId, quantity)) {
      return false;
    }

    existing.quantity -= quantity;
    if (existing.quantity === 0) {
      this.gameState.player.footlocker = this.gameState.player.footlocker.filter(item => item.itemId !== itemId);
    }
    return true;
  }

  moveFromFootlockerByIndex(index: number): boolean {
    if (index < 0 || index >= this.gameState.player.footlocker.length) {
      return false;
    }
    
    const item = this.gameState.player.footlocker[index];
    if (!item) {
      return false;
    }

    if (!this.addItemToInventory(item.itemId, 1, item.enhancementLevel, item.durability, item.maxDurability, item.isShiny)) {
      return false;
    }

    item.quantity -= 1;
    if (item.quantity <= 0) {
      this.gameState.player.footlocker.splice(index, 1);
    }
    return true;
  }

  expandFootlocker(slots: number = 10): boolean {
    const cost = GameConfig.ECONOMY.FOOTLOCKER_EXPANSION_COST_PER_10;
    if (this.spendArcaneAsh(cost)) {
      this.gameState.player.footlockerSlots += slots;
      return true;
    }
    return false;
  }

  markTileExplored(x: number, y: number): void {
    const tileKey = `${Math.floor(x / 32)},${Math.floor(y / 32)}`;
    if (!this.exploredTilesSet.has(tileKey)) {
      this.exploredTilesSet.add(tileKey);
      this.gameState.player.exploredTiles.push(tileKey);
    }
  }

  isTileExplored(x: number, y: number): boolean {
    const tileKey = `${Math.floor(x / 32)},${Math.floor(y / 32)}`;
    return this.exploredTilesSet.has(tileKey);
  }

  markDelveCompleted(x: number, y: number): void {
    if (!this.gameState.player.completedDelves) {
      this.gameState.player.completedDelves = [];
    }
    const delveKey = `${Math.floor(x)},${Math.floor(y)}`;
    if (!this.gameState.player.completedDelves.includes(delveKey)) {
      this.gameState.player.completedDelves.push(delveKey);
    }
  }

  isDelveCompleted(x: number, y: number): boolean {
    if (!this.gameState.player.completedDelves) {
      return false;
    }
    const delveKey = `${Math.floor(x)},${Math.floor(y)}`;
    return this.gameState.player.completedDelves.includes(delveKey);
  }

  clearExploredTiles(): void {
    this.exploredTilesSet.clear();
    this.gameState.player.exploredTiles = [];
  }

  getExploredTiles(): Set<string> {
    return this.exploredTilesSet;
  }

  getCompletedDelveCountByTier(tier: number): number {
    if (!this.gameState.player.completedDelves) {
      return 0;
    }
    
    const discoveredDelves = this.gameState.discoveredDelves || [];
    let count = 0;
    
    for (const delveKey of this.gameState.player.completedDelves) {
      const [xStr, yStr] = delveKey.split(',');
      const x = parseFloat(xStr);
      const y = parseFloat(yStr);
      
      const delve = discoveredDelves.find(d => {
        const dxFloored = Math.floor(d.x);
        const dyFloored = Math.floor(d.y);
        return Math.floor(x) === dxFloored && Math.floor(y) === dyFloored;
      });
      
      if (delve && delve.tier === tier) {
        count++;
      }
    }
    
    return count;
  }

  hasUnlockedFungalHollows(): boolean {
    return this.getCompletedDelveCountByTier(1) >= 5;
  }
}
