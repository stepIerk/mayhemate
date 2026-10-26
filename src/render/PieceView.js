import Phaser from 'phaser';
import { createBadgeTextures } from './badges.js';

export default class PieceView extends Phaser.GameObjects.Container {
  constructor(scene, piece, cellSize) {
    super(scene, 0, 0);

    this.piece = piece;
    createBadgeTextures(scene);

    this.sprite = new Phaser.GameObjects.Sprite(
      scene,
      0,
      0,
      `${piece.color}_${piece.type}`
    );

    this.atkBadge = new Phaser.GameObjects.Image(scene, 0, 0, 'badge_atk');
    this.hpBadge = new Phaser.GameObjects.Image(scene, 0, 0, 'badge_hp');

    this.atkText = new Phaser.GameObjects.Text(scene, 0, 0, String(piece.atk), {
      fontFamily: 'monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#000000',
    }).setOrigin(0.5);

    this.hpText = new Phaser.GameObjects.Text(scene, 0, 0, String(piece.hp), {
      fontFamily: 'monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.add([this.sprite, this.atkBadge, this.hpBadge, this.atkText, this.hpText]);
    this.layout(cellSize);

    scene.add.existing(this);
    this.setInteractive({ useHandCursor: true, draggable: true });
  }

  layout(cellSize) {
    this.sprite.setScale((cellSize * 0.8) / this.sprite.height);

    const badgeSize = Math.max(18, Math.round(cellSize * 0.3));
    const fontSize = Math.max(10, Math.round(badgeSize * 0.58));
    const halfWidth = this.sprite.displayWidth / 2;
    const badgeY = this.sprite.displayHeight / 2 - badgeSize / 2;
    const atkX = -halfWidth + 2;
    const hpX = halfWidth - 2;

    this.atkBadge.setPosition(atkX, badgeY).setDisplaySize(badgeSize, badgeSize);
    this.hpBadge.setPosition(hpX, badgeY).setDisplaySize(badgeSize, badgeSize);
    this.atkText.setPosition(atkX, badgeY).setFontSize(fontSize);
    this.hpText.setPosition(hpX, badgeY).setFontSize(fontSize);

    this.setSize(this.sprite.displayWidth + badgeSize, this.sprite.displayHeight);

    if (this.input?.hitArea?.setSize) {
      this.input.hitArea.setSize(this.width, this.height);
    }
  }

  refreshStats() {
    this.hpText.setText(String(this.piece.hp));
    this.atkText.setText(String(this.piece.atk));
  }
}
