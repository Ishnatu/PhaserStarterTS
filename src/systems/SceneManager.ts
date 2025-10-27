import Phaser from 'phaser';
import { GameScene } from '../types/GameTypes';

export class SceneManager {
  private game: Phaser.Game;
  private static instance: SceneManager;

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

  transitionTo(sceneName: GameScene, data?: any): void {
    const sceneKey = this.getSceneKey(sceneName);
    
    const currentScene = this.game.scene.getScenes(true)[0];
    if (currentScene) {
      currentScene.scene.start(sceneKey, data);
    }
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
