import Phaser from 'phaser';
import { Game } from '../game/Game.js';
import PieceView from '../render/PieceView.js';
import BoardView from '../render/BoardView.js';

const BOARD_HEIGHT_RATIO = 0.7;
const PORTRAIT_TOP_SPACE_RATIO = 0.2;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.logic = new Game();
    this.logic.createInitialPieces();

    this.pieceViews = new Map();
    this.selectedPiece = null;
    this.boardView = new BoardView(this);
    this.boardView.onCellClick = (col, row) => this.onCellClick(col, row);

    this.layoutBoard();

    for (const piece of this.logic.pieces) {
      this.addPieceView(piece);
    }

    this.input.on('dragstart', (pointer, gameObject) => this.dragStart(gameObject));

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => this.drag(gameObject, dragX, dragY));

    this.input.on('dragend', (pointer, gameObject) => this.dragEnd(gameObject));

    this.scale.on('resize', this.layoutBoard, this);

    this.events.on('ui:end-turn', this.endTurn, this);

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layoutBoard, this);
      this.events.off('ui:end-turn', this.endTurn, this);
      this.scene.stop('BottomUiScene');
    });



    const PX = 6;

    if (!this.textures.exists('px-square')) {
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xffffff, 1);          // белый — чтобы потом тонировать
        g.fillRect(0, 0, PX, PX);
        g.generateTexture('px-square', PX, PX);
        g.destroy();
    }


        // Создаём один раз, переиспользуем на каждый удар
    this.splash = this.add.particles(0, 0, 'px-square', {
        // Разлёт
        speed: { min: 90, max: 260 },
        angle: { min: 0, max: 360 },

        // Падение вниз — чтобы «осколки» не висели в воздухе
        gravityY: 700,

        // Время жизни
        lifespan: { min: 300, max: 600 },

        // Плавно уменьшается до нуля — «рассыпается»
        scale: { start: 1.8, end: 0 },

        // Плавно исчезает
        alpha: { start: 1, end: 0 },

        // Каждая частица получает случайный оттенок из массива
        // tint: [ 0xffffff, 0x3d3d3d, 0x131313 ],

        // Лёгкое вращение осколков (если хотите строгий пиксель-арт — уберите или 0)
        rotate: { min: 0, max: 360 },

        // blendMode: 'ADD',

        // Важно: эмиттер спит и ждёт команды explode()
        emitting: false,

        // Защита от флуда
        maxParticles: 60
    });


    const boardBottomY = this.uiY;

    this.scene.launch("BottomUiScene", {
      boardBottomY
    });
  }

  layoutBoard(gameSize) {
    const width = gameSize?.width ?? this.scale.width;
    const height = gameSize?.height ?? this.scale.height;
    const isPortrait = height > width;

    const cellSize = isPortrait
      ? Math.floor(width / 8)
      : Math.floor((height * BOARD_HEIGHT_RATIO) / 8);
    const gridSize = cellSize * 8;
    const x0 = Math.floor((width - gridSize) / 2);
    const y0 = isPortrait
      ? Math.floor((height - gridSize) * PORTRAIT_TOP_SPACE_RATIO)
      : 0;

    this.cellSize = cellSize;
    this.boardX = x0;
    this.boardY = y0;
    this.uiY = y0 + gridSize;

    this.boardView.layout(x0, y0, cellSize);

    for (const view of this.pieceViews.values()) {
      view.layout(cellSize);
      this.placePieceView(view);
    }

    const bottomUi = this.scene.get('BottomUiScene');
    if (bottomUi?.scene?.isActive()) {
      bottomUi.layout(this.uiY);
    }
  }

  addPieceView(piece) {
    const view = new PieceView(this, piece, this.cellSize);
    this.placePieceView(view);

    view.on('pointerdown', () => {
      this.selectPiece(piece);
    });

    this.pieceViews.set(piece.id, view);
    return view;
  }

  dragStart(gameObject) {
    this.children.bringToTop(gameObject);
    gameObject.setData('startX', gameObject.x);
    gameObject.setData('startY', gameObject.y);
  }

  drag(gameObject, dragX, dragY) {
    // увеличиваем немного фигуру
    if (gameObject.piece) {
      gameObject.setScale(1.15);
    }
    gameObject.x = dragX;
    gameObject.y = dragY;
  }

  dragEnd(gameObject) {
    const piece = gameObject.piece;
    if (!piece) {
      return;
    }

    gameObject.setScale(1);

    const { col, row } = this.boardView.worldToCell(gameObject.x, gameObject.y);

    const resetPosition = () => {
      gameObject.x = gameObject.getData('startX');
      gameObject.y = gameObject.getData('startY');
    };

    if (col === piece.col && row === piece.row) {
      resetPosition();
      return;
    }

    if (col < 0 || col >= 8 || row < 0 || row >= 8) {
      resetPosition();
      return;
    }

    if (!this.performAction(piece, col, row)) {
      resetPosition();
      return;
    }

    this.clearSelection();
  }

  performAction(piece, col, row) {
    if (col === piece.col && row === piece.row) {
      return false;
    }

    if (!this.logic.isLegalMove(piece, col, row)) {
      return false;
    }

    const target = this.logic.getPieceAt(col, row);
    const result = this.logic.apply(piece, col, row);
    const view = this.pieceViews.get(piece.id);

    if (target) {
      const targetView = this.pieceViews.get(target.id);

      if (result === 'kill') {
        targetView?.destroy();
        this.pieceViews.delete(target.id);
        this.sound.play('kill');
      } else {
        targetView?.refreshStats();
      }

      this.addSplash(target);
    }

    view?.refreshStats();
    this.placePieceView(view);

    if (result === 'move') {
      this.sound.play('move');
    }

    return true;
  }

  selectPiece(piece) {
    this.selectedPiece = piece;
    this.boardView.showMoves(this.logic.getLegalMoves(piece));
    this.boardView.cellAt(piece.col, piece.row)?.showHighlight('selected');
  }

  clearSelection() {
    this.selectedPiece = null;
    this.boardView.clearHighlights();
  }

  endTurn() {
    this.clearSelection();
    this.logic.endTurn();
    
  }

  onCellClick(col, row) {
    const piece = this.selectedPiece;
    if (!piece) {
      return;
    }

    if (col === piece.col && row === piece.row) {
      this.clearSelection();
      return;
    }

    this.performAction(piece, col, row);
    this.clearSelection();
  }

  placePieceView(view) {
    if (!view) {
      return;
    }

    const { x, y } = this.boardView.cellToWorld(
      view.piece.col,
      view.piece.row
    );

    view.setPosition(x, y);
  }

  getPieceCords(piece) {
    return this.boardView.cellToWorld(piece.col, piece.row);
  }

  addSplash(piece) {
    if (piece) {
      let cords = this.getPieceCords(piece);
      if (piece.color == 'black'){
        this.splash.setParticleTint(0x3d3d3d);
      } else {
        this.splash.setParticleTint(0xffffff);
      }
      this.splash.explode(30, cords.x, cords.y)
      this.sound.play('hit');
      this.cameras.main.shake(120, 0.002);
    }

  }
}
