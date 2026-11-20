import Phaser from 'phaser';
import { PIECE_TYPES } from '../game/pieces.js';
import { getCardCatalog, setCardCatalog } from '../game/deck.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  init(data) {
    this.mode = data?.mode ?? 'local';
    this.joinCode = data?.code ?? '';
    this.resume = data?.resume ?? null;
    this.started = false;
  }

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
    this.load.json('card-catalog', 'assets/cards/cards.json')
  }

  create() {
    setCardCatalog(this.cache.json.get('card-catalog'));

    const catalog = getCardCatalog();
    const urls = [
      catalog.template,
      catalog.back,
      ...catalog.cards.map((card) => card.art),
    ].filter(Boolean);
    const pending = [...new Set(urls)].filter(
      (url) => !this.textures.exists(url)
    );

    for (const url of pending) {
      this.load.image(url, url);
    }

    if (pending.length === 0) {
      this.startLobby();
      return;
    }

    this.load.once('complete', () => this.startLobby());
    this.load.start();
  }

  startLobby() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.scene.start('LobbyScene', {
      mode: this.mode,
      code: this.joinCode,
      resume: this.resume,
    });
  }
}
