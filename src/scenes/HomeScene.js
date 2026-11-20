import Phaser from 'phaser';
import { loadSession } from '../game/sessionPersistence.js';

export default class HomeScene extends Phaser.Scene {
  constructor() {
    super('HomeScene');
  }

  create() {
    const saved = loadSession();

    if (saved) {
      this.scene.start('BootScene', {
        mode: saved.role === 'host' ? 'host' : 'join',
        code: saved.code,
        resume: saved,
      });
      return;
    }

    this.title = this.add
      .text(0, 0, 'Mayhemate', {
        fontFamily: 'Arial',
        fontSize: '64px',
        color: '#955e23',
      })
      .setOrigin(0.5);

    this.localButton = this.createButton('Локально', () => {
      this.scene.start('BootScene', { mode: 'local' });
    });

    this.hostButton = this.createButton('Создать игру', () => {
      this.scene.start('BootScene', { mode: 'host' });
    });

    this.joinButton = this.createButton('Присоединиться', () => {
      const code = window.prompt('Введите код комнаты');

      if (!code || !code.trim()) {
        return;
      }

      this.scene.start('BootScene', { mode: 'join', code: code.trim() });
    });

    this.layout();

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
    });
  }

  createButton(label, onClick) {
    const button = this.add
      .text(0, 0, label, {
        fontFamily: 'Arial',
        fontSize: '30px',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setColor('#ffe39a'));
    button.on('pointerout', () => button.setColor('#ffd166'));
    button.on('pointerdown', onClick);

    return button;
  }

  layout(gameSize) {
    const width = gameSize?.width ?? this.scale.width;
    const height = gameSize?.height ?? this.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;

    this.title.setPosition(centerX, centerY - 150);
    this.localButton.setPosition(centerX, centerY - 30);
    this.hostButton.setPosition(centerX, centerY + 40);
    this.joinButton.setPosition(centerX, centerY + 110);
  }
}
