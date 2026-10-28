import Phaser from 'phaser';
import ButtonView from '../render/ButtonView.js';

const END_TURN_BUTTON_WIDTH = 90;
const END_TURN_BUTTON_HEIGHT = 35;
const END_TURN_BUTTON_TOP = 12;

const TEMPO_RADIUS = 10;
const TEMPO_SPACING = 20;
const TEMPO_PADDING = 30;

export class BottomUiScene extends Phaser.Scene {
  constructor() {
    super('BottomUiScene');
  }

  init(data) {
    this.boardBottomY = data.boardBottomY ?? 0;
    this.session = data.session ?? null;
  }

  create() {
    this.panel = this.add.container(0, 0).setDepth(100);

    this.background = new Phaser.GameObjects.Rectangle(
      this,
      0,
      0,
      1,
      1,
      0x11131a,
      1
    ).setOrigin(0);

    this.topLine = new Phaser.GameObjects.Rectangle(
      this,
      0,
      0,
      1,
      2,
      0x955e23,
      1
    ).setOrigin(0);

    this.endTurnButton = new ButtonView(
      this,
      'Завершить',
      END_TURN_BUTTON_WIDTH,
      END_TURN_BUTTON_HEIGHT,
      () => {
        this.scene.get('GameScene').events.emit('ui:end-turn');
      }
    );

    this.tempoContainer = this.add.container(0, 0);
    this.tempoCircles = [];

    this.panel.add([this.background, this.topLine, this.endTurnButton, this.tempoContainer]);

    this.layout(this.boardBottomY);

    if (this.session) {
      this.unsubscribe = this.session.subscribe((resolved) => {
        this.updateTempo(resolved?.state ?? this.session.toState());
      });
      this.updateTempo(this.session.toState());
    }

    this.events.once('shutdown', () => {
      if (this.unsubscribe) {
        this.unsubscribe();
      }
    });
  }

  layout(boardBottomY) {
    this.boardBottomY = boardBottomY;

    const height = Math.max(0, this.scale.height - boardBottomY);

    this.panel.setPosition(0, boardBottomY);
    this.background.setSize(this.scale.width, height);
    this.topLine.setSize(this.scale.width, 2);
    this.panel.setVisible(height > 0);

    this.endTurnButton.layout(
      this.scale.width / 2,
      END_TURN_BUTTON_TOP + END_TURN_BUTTON_HEIGHT / 2
    );
    this.endTurnButton.setVisible(
      height >= END_TURN_BUTTON_TOP + END_TURN_BUTTON_HEIGHT
    );

    this.updateTempoLayout();
  }

  updateTempo(state) {
    if (!state) {
      return;
    }

    const maxTempo = Math.max(1, state.maxTempo ?? 1);
    const currentTurn = state.turn ?? 'white';
    const tempo = state.heroes?.[currentTurn]?.tempo ?? maxTempo;

    for (const circle of this.tempoCircles) {
      circle.destroy();
    }
    this.tempoCircles = [];

    const rightX = this.scale.width - TEMPO_PADDING;
    const topY = END_TURN_BUTTON_TOP + TEMPO_RADIUS;

    for (let i = 0; i < maxTempo; i++) {
      const isSpent = i >= tempo;
      const circle = this.add.circle(
        rightX - (maxTempo - 1 - i) * TEMPO_SPACING,
        topY,
        TEMPO_RADIUS,
        isSpent ? 0x222222 : 0xffd54f
      );
      circle.setStrokeStyle(2, 0x000000);
      this.tempoContainer.add(circle);
      this.tempoCircles.push(circle);
    }

    this.updateTempoLayout();
  }

  updateTempoLayout() {
    if (!this.tempoContainer) {
      return;
    }

    const rightX = this.scale.width - TEMPO_PADDING;
    const topY = END_TURN_BUTTON_TOP + TEMPO_RADIUS;

    this.tempoCircles.forEach((circle, index, array) => {
      const maxTempo = array.length;
      circle.x = rightX - (maxTempo - 1 - index) * TEMPO_SPACING;
      circle.y = topY;
    });
  }
}