export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export class AudioManager {
  private static instance: AudioManager;
  private settings: AudioSettings;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentMusicKey: string = '';
  private previousMusicKey: string = '';
  private scene: Phaser.Scene | null = null;

  private constructor() {
    this.settings = this.loadSettings();
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  setScene(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  private loadSettings(): AudioSettings {
    const stored = localStorage.getItem('audioSettings');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse audio settings', e);
      }
    }
    return {
      musicVolume: 0.5,
      sfxVolume: 0.7,
      muted: false,
    };
  }

  private saveSettings(): void {
    localStorage.setItem('audioSettings', JSON.stringify(this.settings));
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setMusicVolume(volume: number): void {
    this.settings.musicVolume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
    this.updateMusicVolume();
  }

  setSfxVolume(volume: number): void {
    this.settings.sfxVolume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
  }

  toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.saveSettings();
    this.updateMusicVolume();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.saveSettings();
    this.updateMusicVolume();
  }

  private updateMusicVolume(): void {
    if (this.currentMusic && this.currentMusic.isPlaying) {
      const volume = this.settings.muted ? 0 : this.settings.musicVolume;
      (this.currentMusic as Phaser.Sound.WebAudioSound).setVolume(volume);
    }
  }

  playMusic(scene: Phaser.Scene, key: string, fadeIn: boolean = true): void {
    // Don't restart if same music is already playing
    if (this.currentMusicKey === key && this.currentMusic && this.currentMusic.isPlaying) {
      return;
    }

    // Check if audio file exists in cache
    if (!scene.cache.audio.exists(key)) {
      console.warn(`Audio key "${key}" not found - skipping music playback`);
      return;
    }

    if (this.currentMusic && this.currentMusic.isPlaying) {
      this.stopMusic(true);
    }

    this.scene = scene;
    this.currentMusicKey = key;
    const volume = this.settings.muted ? 0 : this.settings.musicVolume;
    
    this.currentMusic = scene.sound.add(key, {
      loop: true,
      volume: fadeIn ? 0 : volume,
    });

    this.currentMusic.play();

    if (fadeIn && volume > 0) {
      scene.tweens.add({
        targets: this.currentMusic,
        volume: volume,
        duration: 2000,
        ease: 'Linear',
      });
    }
  }

  switchMusic(scene: Phaser.Scene, key: string, crossfade: boolean = true): void {
    // Don't switch if same music is already playing
    if (this.currentMusicKey === key && this.currentMusic && this.currentMusic.isPlaying) {
      return;
    }

    // Check if audio file exists in cache
    if (!scene.cache.audio.exists(key)) {
      console.warn(`Audio key "${key}" not found - skipping music switch`);
      return;
    }

    if (crossfade) {
      this.stopMusic(true);
      setTimeout(() => {
        this.playMusic(scene, key, true);
      }, 1500);
    } else {
      this.stopMusic(false);
      this.playMusic(scene, key, true);
    }
  }

  savePreviousMusic(): void {
    this.previousMusicKey = this.currentMusicKey;
  }

  restorePreviousMusic(scene: Phaser.Scene): void {
    if (this.previousMusicKey) {
      this.switchMusic(scene, this.previousMusicKey, true);
      this.previousMusicKey = '';
    }
  }

  getCurrentMusicKey(): string {
    return this.currentMusicKey;
  }

  stopMusic(fadeOut: boolean = true): void {
    if (!this.currentMusic || !this.currentMusic.isPlaying) return;

    if (fadeOut) {
      this.scene?.tweens.add({
        targets: this.currentMusic,
        volume: 0,
        duration: 1500,
        ease: 'Linear',
        onComplete: () => {
          this.currentMusic?.stop();
          this.currentMusic = null;
          this.currentMusicKey = '';
        },
      });
    } else {
      this.currentMusic.stop();
      this.currentMusic = null;
      this.currentMusicKey = '';
    }
  }

  playSfx(scene: Phaser.Scene, key: string): void {
    if (this.settings.muted) return;
    scene.sound.play(key, { volume: this.settings.sfxVolume });
  }

  getMusicVolume(): number {
    return this.settings.musicVolume;
  }

  getSfxVolume(): number {
    return this.settings.sfxVolume;
  }

  isMuted(): boolean {
    return this.settings.muted;
  }
}
