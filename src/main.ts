import Phaser from 'phaser';
import { MainMenuScene } from './scenes/MainMenuScene';
import { TownScene } from './scenes/TownScene';
import { ExploreScene } from './scenes/ExploreScene';
import { DelveScene } from './scenes/DelveScene';
import { CombatScene } from './scenes/CombatScene';
import { EscMenuScene } from './scenes/EscMenuScene';
import { InterfaceMenuScene } from './scenes/InterfaceMenuScene';
import { FungalHollowsScene } from './scenes/FungalHollowsScene';
import { SceneManager } from './systems/SceneManager';
import { GameStateManager } from './systems/GameStateManager';
import { ItemDatabase } from './config/ItemDatabase';
import { HeartbeatManager } from './utils/HeartbeatManager';
import { EnemyFactory } from './systems/EnemyFactory';

// Global user cache
declare global {
  interface Window {
    authenticatedUser?: {
      id: string;
      username: string;
      createdAt: string;
    };
  }
}

// Function to show blocking modal for duplicate instances
function showDuplicateInstanceModal(): void {
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
    window.location.href = 'about:blank';
  };
  
  overlay.appendChild(message);
  overlay.appendChild(subMessage);
  overlay.appendChild(exitButton);
  document.body.appendChild(overlay);
  
  document.addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);
  
  setTimeout(() => {
    window.close();
    window.location.href = 'about:blank';
  }, 10000);
}

// Show landing page for unauthenticated users
function showLandingPage(): void {
  const root = document.getElementById('game')!;
  root.innerHTML = '';
  
  const container = document.createElement('div');
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.backgroundColor = '#1a1a2e';
  container.style.fontFamily = '"Press Start 2P", monospace';
  container.style.color = '#ffffff';
  
  const title = document.createElement('h1');
  title.textContent = 'GEMFORGE CHRONICLES';
  title.style.fontSize = '48px';
  title.style.marginBottom = '20px';
  title.style.color = '#f0a020';
  title.style.textAlign = 'center';
  
  const subtitle = document.createElement('h2');
  subtitle.textContent = 'PHASE ONE: THE HUNT';
  subtitle.style.fontSize = '24px';
  subtitle.style.marginBottom = '80px';
  subtitle.style.color = '#f0a020';
  subtitle.style.textAlign = 'center';
  
  const loginButton = document.createElement('button');
  loginButton.textContent = 'LOG IN TO PLAY';
  loginButton.style.fontSize = '20px';
  loginButton.style.padding = '20px 40px';
  loginButton.style.backgroundColor = '#f0a020';
  loginButton.style.color = '#1a1a2e';
  loginButton.style.border = 'none';
  loginButton.style.cursor = 'pointer';
  loginButton.style.fontFamily = '"Press Start 2P", monospace';
  loginButton.style.fontWeight = 'bold';
  loginButton.style.transition = 'all 0.3s';
  
  loginButton.onmouseover = () => {
    loginButton.style.backgroundColor = '#ffcc66';
  };
  
  loginButton.onmouseout = () => {
    loginButton.style.backgroundColor = '#f0a020';
  };
  
  loginButton.onclick = () => {
    window.location.href = '/api/login';
  };
  
  const footer = document.createElement('div');
  footer.textContent = '© 2025 - A Dark Fantasy Extraction RPG';
  footer.style.fontSize = '14px';
  footer.style.marginTop = '100px';
  footer.style.color = '#888888';
  
  container.appendChild(title);
  container.appendChild(subtitle);
  container.appendChild(loginButton);
  container.appendChild(footer);
  root.appendChild(container);
}

// Set up disconnect/crash handlers for auto-save
function setupDisconnectHandlers(): void {
  // Helper to create save payload for sendBeacon (removes currency fields, proper format)
  const createBeaconPayload = (): Blob | null => {
    try {
      const gameState = GameStateManager.getInstance();
      if (!gameState.isInitialized()) return null;
      
      const state = gameState.getState();
      const player = gameState.getPlayer();
      
      // Create save data WITHOUT currency fields (server-authoritative)
      const saveData = {
        ...state,
        player: {
          ...player,
          exploredTiles: Array.from(gameState.getExploredTiles()),
          // Explicitly remove currency fields - server manages these
          arcaneAsh: undefined,
          crystallineAnimus: undefined,
        }
      };
      
      // Remove currency from top-level too if present
      delete (saveData as any).arcaneAsh;
      delete (saveData as any).crystallineAnimus;
      delete (saveData.player as any).arcaneAsh;
      delete (saveData.player as any).crystallineAnimus;
      
      // Wrap in expected format and create Blob with proper content type
      const payload = JSON.stringify({ saveData });
      return new Blob([payload], { type: 'application/json' });
    } catch (error) {
      console.error('Failed to create beacon payload:', error);
      return null;
    }
  };

  // Save on page unload (closing tab, navigating away)
  window.addEventListener('beforeunload', (event) => {
    const payload = createBeaconPayload();
    if (payload) {
      navigator.sendBeacon('/api/game/save', payload);
      console.log('Emergency save triggered on page unload');
    }
  });

  // Save when tab becomes hidden (user switches tabs, minimizes)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      try {
        const gameState = GameStateManager.getInstance();
        if (gameState.isInitialized()) {
          await gameState.saveToServer();
          console.log('Auto-save triggered on visibility change');
        }
      } catch (error) {
        console.error('Failed to save on visibility change:', error);
      }
    }
  });

  // Save on page hide (mobile browsers, some desktop scenarios)
  window.addEventListener('pagehide', (event) => {
    const payload = createBeaconPayload();
    if (payload) {
      navigator.sendBeacon('/api/game/save', payload);
      console.log('Emergency save triggered on page hide');
    }
  });
}

// Initialize the game
function initializeGame(): void {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game',
    width: 1920,
    height: 1080,
    backgroundColor: '#0f0f13',
    pixelArt: true,
    antialias: false,
    dom: {
      createContainer: true,
    },
    scene: [MainMenuScene, TownScene, ExploreScene, DelveScene, CombatScene, EscMenuScene, InterfaceMenuScene, FungalHollowsScene],
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

  console.log('Initializing Gemforge Chronicles...');
  const game = new Phaser.Game(config);
  SceneManager.initialize(game);
  GameStateManager.getInstance();

  // Set up disconnect/crash handlers for emergency saves
  setupDisconnectHandlers();

  // Heartbeat monitoring with self-healing watchdog mechanism
  // Watchdog runs continuously and re-arms when heartbeat stops unexpectedly
  let watchdogIntervalId: number | null = null;
  
  const rearmWatchdog = () => {
    // Called when heartbeat stops unexpectedly to resume monitoring
    console.warn('[SECURITY] Heartbeat stopped - re-arming watchdog for recovery');
    if (watchdogIntervalId === null) {
      startWatchdog();
    }
  };
  
  const tryStartHeartbeat = (): boolean => {
    const heartbeat = HeartbeatManager.getInstance();
    
    // Already running - no action needed
    if (heartbeat.isRunning()) {
      return true;
    }
    
    const userId = window.authenticatedUser?.id;
    if (userId) {
      heartbeat.setPlayerId(userId);
      const started = heartbeat.start(
        () => showDuplicateInstanceModal(),
        rearmWatchdog // Callback if heartbeat stops unexpectedly
      );
      if (started) {
        console.log('[SECURITY] Heartbeat monitoring started for authenticated user');
        return true;
      }
    }
    return false;
  };
  
  const startWatchdog = () => {
    // Persistent check every 5 seconds until heartbeat starts
    // This handles delayed auth, reconnection, tab resume, and recovery scenarios
    watchdogIntervalId = window.setInterval(() => {
      if (tryStartHeartbeat()) {
        if (watchdogIntervalId !== null) {
          clearInterval(watchdogIntervalId);
          watchdogIntervalId = null;
        }
      } else {
        console.warn('[SECURITY] Heartbeat watchdog: waiting for authenticated user');
      }
    }, 5000);
  };
  
  // Start watchdog initially
  startWatchdog();
  
  // Initial attempt after brief delay for game initialization (fast path)
  setTimeout(() => {
    if (tryStartHeartbeat() && watchdogIntervalId !== null) {
      clearInterval(watchdogIntervalId);
      watchdogIntervalId = null;
    }
  }, 1000);

  console.log('Gemforge Chronicles - Phase One: The Hunt');
  console.log('Game initialized successfully!');
}

// Bootstrap: Check authentication before loading game
async function bootstrap(): Promise<void> {
  // Clear any old client-side saves - all progress is now server-authoritative
  try {
    localStorage.removeItem('gemforge_save');
    console.log('Cleared old client-side save data');
  } catch (e) {
    // Ignore localStorage errors
  }

  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include',
    });
    
    if (response.ok) {
      // User is authenticated - cache user and load game
      const user = await response.json();
      window.authenticatedUser = user;
      initializeGame();
    } else {
      // User not authenticated - show landing page
      showLandingPage();
    }
  } catch (error) {
    console.error('Bootstrap error:', error);
    // On error, show landing page
    showLandingPage();
  }
}

// Start the bootstrap process
bootstrap();
