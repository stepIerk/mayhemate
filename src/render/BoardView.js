import CellView from './CellView.js';

export default class BoardView {
  constructor(scene) {
    this.scene = scene;
    this.layer = scene.add.container(0, 0).setDepth(-1);
    this.cells = [];

    this.originX = 0;
    this.originY = 0;
    this.cellSize = 0;

    this.onCellClick = null;
  }

  createCells() {
    for (let row = 0; row < 8; row++) {
      this.cells[row] = [];

      for (let col = 0; col < 8; col++) {
        const cell = new CellView(this.scene, col, row, this.cellSize);

        cell.on('pointerdown', () => {
          this.onCellClick?.(col, row);
        });

        this.layer.add(cell);
        this.cells[row][col] = cell;
      }
    }
  }

  layout(x0, y0, cellSize) {
    this.originX = x0;
    this.originY = y0;
    this.cellSize = cellSize;

    if (this.cells.length === 0) {
      this.createCells();
    }

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const color = (row + col) % 2 === 0 ? 0xe69c69 : 0xbf6f4a;

        this.cells[row][col].layout(
          x0 + col * cellSize + cellSize / 2,
          y0 + row * cellSize + cellSize / 2,
          cellSize,
          color
        );
      }
    }
  }

  cellAt(col, row) {
    return this.cells[row]?.[col];
  }

  showMoves(moves) {
    this.clearHighlights();

    for (const move of moves) {
      this.cellAt(move.col, move.row)?.showHighlight(move.type);
    }
  }

  clearHighlights() {
    for (const row of this.cells) {
      for (const cell of row) {
        cell.clearHighlight();
      }
    }
  }

  cellToWorld(col, row) {
    return {
      x: this.originX + col * this.cellSize + this.cellSize / 2,
      y: this.originY + row * this.cellSize + this.cellSize / 2,
    };
  }

  worldToCell(x, y) {
    return {
      col: Math.floor((x - this.originX) / this.cellSize),
      row: Math.floor((y - this.originY) / this.cellSize),
    };
  }
}
