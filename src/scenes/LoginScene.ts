import Phaser from 'phaser';
import { FONTS } from '../config/fonts';

export class LoginScene extends Phaser.Scene {
  private emailInput!: Phaser.GameObjects.DOMElement;
  private passwordInput!: Phaser.GameObjects.DOMElement;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LoginScene' });
  }

  preload() {
    this.load.image('gemforge-logo', '/assets/ui/gemforge-logo.png');
  }

  create() {
    const { width, height } = this.cameras.main;

    // Background
    this.add.rectangle(0, 0, width, height, 0x0f0f13).setOrigin(0);

    // Logo
    const logo = this.add.sprite(width / 2, 240, 'gemforge-logo');
    logo.setOrigin(0.5);
    logo.setScale(0.18);

    // Email field
    const emailInputHtml = `
      <input type="email" id="email-input" style="
        width: 500px;
        height: 50px;
        font-family: ${FONTS.primary}, monospace;
        font-size: 18px;
        padding: 12px;
        background: #1a1a2e;
        color: #ffffff;
        border: 2px solid #444;
        outline: none;
      " placeholder="your@email.com" />
    `;
    this.emailInput = this.add.dom(width / 2, 480).createFromHTML(emailInputHtml);

    // Password field
    const passwordInputHtml = `
      <input type="password" id="password-input" style="
        width: 500px;
        height: 50px;
        font-family: ${FONTS.primary}, monospace;
        font-size: 18px;
        padding: 12px;
        background: #1a1a2e;
        color: #ffffff;
        border: 2px solid #444;
        outline: none;
      " placeholder="••••••••" />
    `;
    this.passwordInput = this.add.dom(width / 2, 570).createFromHTML(passwordInputHtml);

    // Error text
    this.errorText = this.add.text(width / 2, 650, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ff4444',
      resolution: 2,
    }).setOrigin(0.5);

    // Login button
    const loginBtn = this.add.rectangle(width / 2, 730, 200, 50, 0x44aa44).setInteractive({ useHandCursor: true });
    const loginText = this.add.text(width / 2, 730, 'Login', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0.5);

    loginBtn.on('pointerover', () => loginBtn.setFillStyle(0x55cc55));
    loginBtn.on('pointerout', () => loginBtn.setFillStyle(0x44aa44));
    loginBtn.on('pointerdown', () => this.handleLogin());

    // Register link
    const registerPrompt = this.add.text(width / 2, 830, "Don't have an account?", {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#aaaaaa',
      resolution: 2,
    }).setOrigin(0.5);

    const registerLink = this.add.text(width / 2, 870, 'Create Account', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#4488ff',
      resolution: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    registerLink.on('pointerover', () => registerLink.setColor('#5599ff'));
    registerLink.on('pointerout', () => registerLink.setColor('#4488ff'));
    registerLink.on('pointerdown', () => {
      this.scene.start('SignupScene');
    });

    // Enter key to submit
    this.input.keyboard?.on('keydown-ENTER', () => this.handleLogin());
  }

  private async handleLogin() {
    const emailEl = document.getElementById('email-input') as HTMLInputElement;
    const passwordEl = document.getElementById('password-input') as HTMLInputElement;

    if (!emailEl || !passwordEl) return;

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    if (!email || !password) {
      this.errorText.setText('Please enter email and password');
      return;
    }

    this.errorText.setText('Logging in...');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Login successful, go to main menu
        this.scene.start('MainMenuScene');
      } else {
        this.errorText.setText(data.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.errorText.setText('Network error. Please try again.');
    }
  }
}
