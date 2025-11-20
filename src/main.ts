import Phaser from 'phaser';
import { MainMenuScene } from './scenes/MainMenuScene';
import { TownScene } from './scenes/TownScene';
import { ExploreScene } from './scenes/ExploreScene';
import { DelveScene } from './scenes/DelveScene';
import { CombatScene } from './scenes/CombatScene';
import { EscMenuScene } from './scenes/EscMenuScene';
import { InterfaceMenuScene } from './scenes/InterfaceMenuScene';
import { SceneManager } from './systems/SceneManager';
import { GameStateManager } from './systems/GameStateManager';
import { ItemDatabase } from './config/ItemDatabase';
import { HeartbeatManager } from './utils/HeartbeatManager';
import { EnemyFactory } from './systems/EnemyFactory';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#0f0f13',
  pixelArt: true,
  antialias: false,
  scene: [MainMenuScene, TownScene, ExploreScene, DelveScene, CombatScene, EscMenuScene, InterfaceMenuScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: true,
    roundPixels: true,
  },
};

ItemDatabase.initialize();

// Initialize game
console.log('Initializing Gemforge Chronicles...');
const game = new Phaser.Game(config);
SceneManager.initialize(game);
GameStateManager.getInstance();

// Function to show blocking modal for duplicate instances
function showDuplicateInstanceModal(): void {
  // Create full-screen blocking overlay
  const overlay = document.createElement('div');
  overlay.id = 'duplicate-instance-modal';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
  overlay.style.zIndex = '999999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.fontFamily = 'VT323, monospace';
  overlay.style.color = '#ff4444';
  
  // Warning message
  const message = document.createElement('div');
  message.style.fontSize = '48px';
  message.style.textAlign = 'center';
  message.style.marginBottom = '40px';
  message.textContent = 'Multiple Game Instances Detected';
  
  const subMessage = document.createElement('div');
  subMessage.style.fontSize = '24px';
  subMessage.style.textAlign = 'center';
  subMessage.style.marginBottom = '60px';
  subMessage.style.color = '#ffffff';
  subMessage.textContent = 'Please close this window to prevent save conflicts';
  
  // Exit button
  const exitButton = document.createElement('button');
  exitButton.textContent = 'Exit Game';
  exitButton.style.fontSize = '32px';
  exitButton.style.padding = '20px 60px';
  exitButton.style.backgroundColor = '#ff4444';
  exitButton.style.color = '#ffffff';
  exitButton.style.border = 'none';
  exitButton.style.cursor = 'pointer';
  exitButton.style.fontFamily = 'VT323, monospace';
  exitButton.style.fontWeight = 'bold';
  
  exitButton.onclick = () => {
    window.close();
    // If window.close() doesn't work (not opened by script), force reload to about:blank
    window.location.href = 'about:blank';
  };
  
  overlay.appendChild(message);
  overlay.appendChild(subMessage);
  overlay.appendChild(exitButton);
  document.body.appendChild(overlay);
  
  // Disable ESC key globally
  document.addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);
  
  // Auto-close after 10 seconds if user doesn't click
  setTimeout(() => {
    window.close();
    window.location.href = 'about:blank';
  }, 10000);
}

// Start heartbeat monitoring after a brief delay to ensure server is ready
setTimeout(() => {
  HeartbeatManager.getInstance().start(() => {
    showDuplicateInstanceModal();
  });
}, 2000); // Wait 2 seconds before starting heartbeat

console.log('Gemforge Chronicles - Phase One: The Hunt');
console.log('Game initialized successfully!');
