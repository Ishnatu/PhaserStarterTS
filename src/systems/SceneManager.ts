import Phaser from 'phaser';
import { GameScene } from '../types/GameTypes';
import { GameStateManager } from './GameStateManager';

export class SceneManager {
  private game: Phaser.Game;
  private static instance: SceneManager;

  private readonly GAMEPLAY_SCENES: GameScene[] = ['town', 'explore', 'delve'];

  private constructor(game: Phaser.Game) {
    this.game = game;
  }

  static initialize(game: Phaser.Game): void {
    if (!SceneManager.instance) {
      SceneManager.instance = new SceneManager(game);
    }
  }

  static getInstance(): SceneManager {
    if (!SceneManager.instance) {
      throw new Error('SceneManager not initialized!');
    }
    return SceneManager.instance;
  }

  async transitionTo(sceneName: GameScene, data?: any): Promise<void> {
    const sceneKey = this.getSceneKey(sceneName);
    
    const currentScene = this.game.scene.getScenes(true)[0];
    if (currentScene) {
      const currentSceneName = this.getCurrentSceneName();
      
      if (currentSceneName && this.GAMEPLAY_SCENES.includes(currentSceneName)) {
        try {
          const gameState = GameStateManager.getInstance();
          if (gameState.isInitialized()) {
            console.log(`Auto-saving before transition: ${currentSceneName} -> ${sceneName}`);
            await gameState.saveToServer();
          }
        } catch (error) {
          console.error('Auto-save before transition failed:', error);
        }
      }
      
      currentScene.scene.start(sceneKey, data);
    }
  }

  private getCurrentSceneName(): GameScene | null {
    const currentScene = this.game.scene.getScenes(true)[0];
    if (!currentScene) return null;
    
    const key = currentScene.scene.key;
    const reverseMap: Record<string, GameScene> = {
      'TownScene': 'town',
      'ExploreScene': 'explore',
      'DelveScene': 'delve',
      'CombatScene': 'combat',
    };
    return reverseMap[key] || null;
  }

  private getSceneKey(sceneName: GameScene): string {
    const sceneMap: Record<GameScene, string> = {
      town: 'TownScene',
      explore: 'ExploreScene',
      delve: 'DelveScene',
      combat: 'CombatScene',
    };
    return sceneMap[sceneName];
  }
}
