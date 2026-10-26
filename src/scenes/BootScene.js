import Phaser from 'phaser';
import { PIECE_TYPES } from '../game/pieces.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    this.load.font('DotumChe', 'assets/font/fnt_dotumche.ttf', 'truetype');

    for (const color of ['white', 'black']) {
      for (const type of Object.keys(PIECE_TYPES)) {
        this.load.image(`${color}_${type}`, `assets/${color}_pieces/spr_${type}_${color}.png`);
      }
    }

    this.load.audio('hit', "assets/audio/hit.mp3")
    this.load.audio('move', "assets/audio/move.mp3")
    this.load.audio('kill', "assets/audio/kill.mp3")

    this.load.image('tempo', 'assets/tempo.png')
  }

  create() { this.scene.start('GameScene'); }
}