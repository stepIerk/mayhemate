import Phaser from 'phaser';
import ButtonView from '../render/ButtonView.js';

const END_TURN_BUTTON_WIDTH = 90;
const END_TURN_BUTTON_HEIGHT = 35;
const END_TURN_BUTTON_TOP = 12;

export class BottomUiScene extends Phaser.Scene {
  constructor() {
    super('BottomUiScene');
  }

  init(data) {
    this.boardBottomY = data.boardBottomY ?? 0;
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

    this.panel.add([this.background, this.topLine, this.endTurnButton]);

    this.layout(this.boardBottomY);
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
  }
}
