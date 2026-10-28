import Phaser from 'phaser';
import { GameSession } from '../game/GameSession.js';
import { moveAction, endTurnAction } from '../game/actions.js';
import PieceView from '../render/PieceView.js';
import BoardView from '../render/BoardView.js';

const BOARD_HEIGHT_RATIO = 0.7;
const PORTRAIT_TOP_SPACE_RATIO = 0.2;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.localColor = null;
  }

  create() {
    this.session = new GameSession();
    this.logic = this.session.game;

    this.pieceViews = new Map();
    this.selectedPiece = null;
    this.boardView = new BoardView(this);
    this.boardView.onCellClick = (col, row) => this.onCellClick(col, row);

    this.layoutBoard();
    this.syncViewsFromState(this.session.toState());

    this.input.on('dragstart', (pointer, gameObject) => this.dragStart(gameObject));
    this.input.on('drag', (pointer, gameObject, dragX, dragY) => this.drag(gameObject, dragX, dragY));
    this.input.on('dragend', (pointer, gameObject) => this.dragEnd(gameObject));

    this.scale.on('resize', this.layoutBoard, this);
    this.events.on('ui:end-turn', this.endTurn, this);

    this.unsubscribe = this.session.subscribe((resolved) => this.onResolved(resolved));

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layoutBoard, this);
      this.events.off('ui:end-turn', this.endTurn, this);
      if (this.unsubscribe) {
        this.unsubscribe();
      }
      this.scene.stop('BottomUiScene');
    });

    const PX = 6;

    if (!this.textures.exists('px-square')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, PX, PX);
      g.generateTexture('px-square', PX, PX);
      g.destroy();
    }

    this.splash = this.add.particles(0, 0, 'px-square', {
      speed: { min: 90, max: 260 },
      angle: { min: 0, max: 360 },
      gravityY: 700,
      lifespan: { min: 300, max: 600 },
      scale: { start: 1.8, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      emitting: false,
      maxParticles: 60,
    });

    const boardBottomY = this.uiY;

    this.scene.launch('BottomUiScene', {
      boardBottomY,
      session: this.session,
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
      if (view.input && view.piece) {
        view.input.enabled = this.canControl(view.piece);
      }
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
      if (!this.canControl(piece)) {
        return;
      }
      this.selectPiece(piece);
    });

    this.pieceViews.set(piece.id, view);
    if (view.input) {
      view.input.enabled = this.canControl(piece);
    }
    return view;
  }

  syncViewsFromState(state) {
    const currentIds = new Set((state?.pieces ?? []).map((piece) => piece.id));

    for (const [id, view] of [...this.pieceViews.entries()]) {
      if (!currentIds.has(id)) {
        view.destroy();
        this.pieceViews.delete(id);
      }
    }

    for (const pieceState of state?.pieces ?? []) {
      const gamePiece = this.logic.getPieceById(pieceState.id);
      if (!gamePiece) {
        continue;
      }

      let view = this.pieceViews.get(gamePiece.id);
      if (!view) {
        view = this.addPieceView(gamePiece);
      } else {
        view.piece = gamePiece;
        view.refreshStats();
        this.placePieceView(view);
      }

      if (view.input) {
        view.input.enabled = this.canControl(gamePiece);
      }
    }
  }

  onResolved(resolved) {
    if (!resolved?.ok) {
      return;
    }

    if (resolved.result === 'move') {
      this.sound.play('move');
    }

    if (resolved.result === 'kill') {
      this.sound.play('kill');
    }

    for (const event of resolved.events ?? []) {
      if (event.type === 'attack' || event.type === 'kill') {
        this.addSplash({
          col: event.col,
          row: event.row,
          color: event.color,
        });
        this.sound.play('hit');
        this.cameras.main.shake(120, 0.002);
      }
    }

    this.syncViewsFromState(resolved.state);

    if (resolved.result === 'endTurn') {
      this.clearSelection();
    }
  }

  dragStart(gameObject) {
    if (!gameObject?.piece || !this.canControl(gameObject.piece)) {
      return;
    }
    this.children.bringToTop(gameObject);
    gameObject.setData('startX', gameObject.x);
    gameObject.setData('startY', gameObject.y);
  }

  drag(gameObject, dragX, dragY) {
    if (!gameObject?.piece || !this.canControl(gameObject.piece)) {
      return;
    }
    gameObject.setScale(1.15);
    gameObject.x = dragX;
    gameObject.y = dragY;
  }
  dragEnd(gameObject) {
    const piece = gameObject?.piece;
    if (!piece) {
      return;
    }

    gameObject.setScale(1);

    const { col, row } = this.boardView.worldToCell(gameObject.x, gameObject.y);

    const resetPosition = () => {
      gameObject.x = gameObject.getData('startX');
      gameObject.y = gameObject.getData('startY');
    };

    if (!this.canControl(piece)) {
      resetPosition();
      return;
    }

    if (col === piece.col && row === piece.row) {
      resetPosition();
      return;
    }

    if (col < 0 || col >= 8 || row < 0 || row >= 8) {
      resetPosition();
      return;
    }

    const result = this.session.dispatch(moveAction(piece.id, col, row));
    if (!result.ok) {
      resetPosition();
      return;
    }

    this.clearSelection();
  }

  performAction(piece, col, row) {
    if (!piece || !this.canControl(piece)) {
      return false;
    }

    const result = this.session.dispatch(moveAction(piece.id, col, row));
    return Boolean(result?.ok);
  }

  selectPiece(piece) {
    if (!this.canControl(piece)) {
      return;
    }
    this.selectedPiece = piece;
    this.boardView.showMoves(this.logic.getLegalMoves(piece));
    this.boardView.cellAt(piece.col, piece.row)?.showHighlight('selected');
  }

  clearSelection() {
    this.selectedPiece = null;
    this.boardView.clearHighlights();
  }

  endTurn() {
    if (this.localColor && this.localColor !== this.logic.turn) {
      return;
    }
    this.clearSelection();
    this.session.dispatch(endTurnAction());
  }

  onCellClick(col, row) {
    const piece = this.selectedPiece;
    if (!piece || !this.canControl(piece)) {
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

  canControl(piece) {
    if (!piece) {
      return false;
    }

    if (this.localColor) {
      return piece.color === this.localColor && piece.color === this.logic.turn;
    }

    return piece.color === this.logic.turn;
  }

  addSplash(target) {
    if (!target) {
      return;
    }

    const cords = this.boardView.cellToWorld(target.col, target.row);
    if (target.color === 'black') {
      this.splash.setParticleTint(0x3d3d3d);
    } else {
      this.splash.setParticleTint(0xffffff);
    }
    this.splash.explode(30, cords.x, cords.y);
    this.sound.play('hit');
    this.cameras.main.shake(120, 0.002);
  }
}