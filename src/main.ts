import Phaser from 'phaser';
import { TownScene } from './scenes/TownScene';
import { ExploreScene } from './scenes/ExploreScene';
import { DelveScene } from './scenes/DelveScene';
import { CombatScene } from './scenes/CombatScene';
import { SceneManager } from './systems/SceneManager';
import { GameStateManager } from './systems/GameStateManager';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 800,
  height: 600,
  backgroundColor: '#0f0f13',
  scene: [TownScene, ExploreScene, DelveScene, CombatScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

SceneManager.initialize(game);
GameStateManager.getInstance();

console.log('Gemforge Chronicles - Phase One: The Hunt');
console.log('Game initialized successfully!');
