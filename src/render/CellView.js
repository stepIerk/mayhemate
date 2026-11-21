import Phaser from 'phaser';

const HIGHLIGHT_COLORS = {
  move: 0x4f9dff,
  attack: 0xff5555,
  selected: 0xffd166,
  target: 0x00c853,
  invalid: 0xff3355,
};

const FILL_ALPHA = {
  move: 0.35,
  attack: 0.35,
  selected: 0.4,
  target: 0.2,
  invalid: 0.4,
};

export default class CellView extends Phaser.GameObjects.Container {
  constructor(scene, col, row, cellSize) {
    super(scene, 0, 0);

    this.col = col;
    this.row = row;

    this.background = new Phaser.GameObjects.Rectangle(
      scene,
      0,
      0,
      cellSize,
      cellSize,
      0xffffff
    );

    this.highlight = new Phaser.GameObjects.Rectangle(
      scene,
      0,
      0,
      cellSize,
      cellSize,
      0xffffff,
      0.35
    ).setVisible(false);

    this.effects = new Phaser.GameObjects.Container(scene, 0, 0);

    this.add([this.background, this.highlight, this.effects]);

    this.pulseTween = null;
    this.highlightType = null;

    this.setSize(cellSize, cellSize);
    scene.add.existing(this);
    this.setInteractive({ useHandCursor: true });
  }

  layout(x, y, cellSize, color) {
    this.setPosition(x, y);

    this.background.setSize(cellSize, cellSize);
    this.background.setFillStyle(color);

    this.highlight.setSize(cellSize, cellSize);

    this.setSize(cellSize, cellSize);

    if (this.input?.hitArea?.setSize) {
      this.input.hitArea.setSize(cellSize, cellSize);
    }
  }

  showHighlight(type, { pulse = type === 'target' } = {}) {
    const color = HIGHLIGHT_COLORS[type] ?? 0xffffff;
    const hasStroke = type === 'target' || type === 'invalid' || type === 'selected';

    this.stopPulse();
    this.highlightType = type;

    this.highlight.setFillStyle(color, FILL_ALPHA[type] ?? 0.35);
    this.highlight.setStrokeStyle(hasStroke ? 2 : 0, color, 0.9);
    this.highlight.setAlpha(1);
    this.highlight.setVisible(true);

    if (pulse) {
      this.pulseTween = this.scene.tweens.add({
        targets: this.highlight,
        alpha: { from: 0.35, to: 1 },
        duration: 640,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: (this.col * 53 + this.row * 97) % 420,
      });
    }
  }

  stopPulse() {
    if (this.pulseTween) {
      this.pulseTween.remove();
      this.pulseTween = null;
    }
  }

  clearHighlight() {
    this.stopPulse();
    this.highlightType = null;
    this.highlight.setStrokeStyle(0);
    this.highlight.setAlpha(1);
    this.highlight.setVisible(false);
  }
}
