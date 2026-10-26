import Phaser from 'phaser';

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

  showHighlight(type) {
    const colors = {
      move: 0x4f9dff,
      attack: 0xff5555,
      selected: 0xffd166,
    };

    this.highlight.setFillStyle(colors[type] ?? 0xffffff, 0.35);
    this.highlight.setVisible(true);
  }

  clearHighlight() {
    this.highlight.setVisible(false);
  }
}
