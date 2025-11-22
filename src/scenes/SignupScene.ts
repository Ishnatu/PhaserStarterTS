import Phaser from 'phaser';
import { FONTS } from '../config/fonts';

export class SignupScene extends Phaser.Scene {
  private usernameInput!: Phaser.GameObjects.DOMElement;
  private emailInput!: Phaser.GameObjects.DOMElement;
  private passwordInput!: Phaser.GameObjects.DOMElement;
  private confirmPasswordInput!: Phaser.GameObjects.DOMElement;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'SignupScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Background
    this.add.rectangle(0, 0, width, height, 0x0f0f13).setOrigin(0);

    // Title
    this.add.text(width / 2, 120, 'Gemforge Chronicles', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xlarge,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0.5);

    this.add.text(width / 2, 190, 'Create Account', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.medium,
      color: '#aaaaaa',
      resolution: 2,
    }).setOrigin(0.5);

    // Username field
    this.add.text(width / 2 - 200, 280, 'Username:', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0, 0.5);

    const usernameInputHtml = `
      <input type="text" id="username-input" style="
        width: 360px;
        height: 40px;
        font-family: ${FONTS.primary}, monospace;
        font-size: 18px;
        padding: 8px;
        background: #1a1a2e;
        color: #ffffff;
        border: 2px solid #444;
        outline: none;
      " placeholder="3-20 characters" maxlength="20" />
    `;
    this.usernameInput = this.add.dom(width / 2 + 80, 280).createFromHTML(usernameInputHtml);

    // Email field
    this.add.text(width / 2 - 200, 360, 'Email:', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0, 0.5);

    const emailInputHtml = `
      <input type="email" id="email-input" style="
        width: 360px;
        height: 40px;
        font-family: ${FONTS.primary}, monospace;
        font-size: 18px;
        padding: 8px;
        background: #1a1a2e;
        color: #ffffff;
        border: 2px solid #444;
        outline: none;
      " placeholder="your@email.com" />
    `;
    this.emailInput = this.add.dom(width / 2 + 80, 360).createFromHTML(emailInputHtml);

    // Password field
    this.add.text(width / 2 - 200, 440, 'Password:', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0, 0.5);

    const passwordInputHtml = `
      <input type="password" id="password-input" style="
        width: 360px;
        height: 40px;
        font-family: ${FONTS.primary}, monospace;
        font-size: 18px;
        padding: 8px;
        background: #1a1a2e;
        color: #ffffff;
        border: 2px solid #444;
        outline: none;
      " placeholder="min. 8 characters" />
    `;
    this.passwordInput = this.add.dom(width / 2 + 80, 440).createFromHTML(passwordInputHtml);

    // Confirm password field
    this.add.text(width / 2 - 200, 520, 'Confirm:', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0, 0.5);

    const confirmPasswordInputHtml = `
      <input type="password" id="confirm-password-input" style="
        width: 360px;
        height: 40px;
        font-family: ${FONTS.primary}, monospace;
        font-size: 18px;
        padding: 8px;
        background: #1a1a2e;
        color: #ffffff;
        border: 2px solid #444;
        outline: none;
      " placeholder="re-enter password" />
    `;
    this.confirmPasswordInput = this.add.dom(width / 2 + 80, 520).createFromHTML(confirmPasswordInputHtml);

    // Error/success text
    this.errorText = this.add.text(width / 2, 600, '', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.xsmall,
      color: '#ff4444',
      resolution: 2,
      wordWrap: { width: 600 },
      align: 'center',
    }).setOrigin(0.5);

    // Create Account button
    const signupBtn = this.add.rectangle(width / 2 - 120, 680, 220, 50, 0x44aa44).setInteractive({ useHandCursor: true });
    const signupText = this.add.text(width / 2 - 120, 680, 'Create Account', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0.5);

    signupBtn.on('pointerover', () => signupBtn.setFillStyle(0x55cc55));
    signupBtn.on('pointerout', () => signupBtn.setFillStyle(0x44aa44));
    signupBtn.on('pointerdown', () => this.handleSignup());

    // Back to login button
    const backBtn = this.add.rectangle(width / 2 + 120, 680, 180, 50, 0x666666).setInteractive({ useHandCursor: true });
    const backText = this.add.text(width / 2 + 120, 680, 'Back to Login', {
      fontFamily: FONTS.primary,
      fontSize: FONTS.size.small,
      color: '#ffffff',
      resolution: 2,
    }).setOrigin(0.5);

    backBtn.on('pointerover', () => backBtn.setFillStyle(0x777777));
    backBtn.on('pointerout', () => backBtn.setFillStyle(0x666666));
    backBtn.on('pointerdown', () => {
      this.scene.start('LoginScene');
    });

    // Enter key to submit
    this.input.keyboard?.on('keydown-ENTER', () => this.handleSignup());
  }

  private async handleSignup() {
    const usernameEl = document.getElementById('username-input') as HTMLInputElement;
    const emailEl = document.getElementById('email-input') as HTMLInputElement;
    const passwordEl = document.getElementById('password-input') as HTMLInputElement;
    const confirmPasswordEl = document.getElementById('confirm-password-input') as HTMLInputElement;

    if (!usernameEl || !emailEl || !passwordEl || !confirmPasswordEl) return;

    const username = usernameEl.value.trim();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmPasswordEl.value;

    // Client-side validation
    if (!username || !email || !password || !confirmPassword) {
      this.errorText.setColor('#ff4444').setText('All fields are required');
      return;
    }

    if (username.length < 3 || username.length > 20) {
      this.errorText.setColor('#ff4444').setText('Username must be 3-20 characters');
      return;
    }

    if (!email.includes('@')) {
      this.errorText.setColor('#ff4444').setText('Invalid email address');
      return;
    }

    if (password.length < 8) {
      this.errorText.setColor('#ff4444').setText('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      this.errorText.setColor('#ff4444').setText('Passwords do not match');
      return;
    }

    this.errorText.setColor('#4488ff').setText('Creating account...');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Registration successful, go to main menu
        this.errorText.setColor('#44ff44').setText('Account created! Welcome to Gemforge Chronicles!');
        this.time.delayedCall(1500, () => {
          this.scene.start('MainMenuScene');
        });
      } else {
        this.errorText.setColor('#ff4444').setText(data.message || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.errorText.setColor('#ff4444').setText('Network error. Please try again.');
    }
  }
}
