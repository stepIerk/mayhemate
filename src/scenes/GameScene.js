import Phaser from 'phaser';
import { GameSession } from '../game/GameSession.js';
import {
  moveAction,
  endTurnAction,
  playCardAction,
} from '../game/actions.js';
import {
  clearSession,
  loadSession,
  saveSession,
} from '../game/sessionPersistence.js';
import PieceView from '../render/PieceView.js';
import BoardView from '../render/BoardView.js';
import ButtonView from '../render/ButtonView.js';

const BOARD_HEIGHT_RATIO = 0.66;
const PORTRAIT_TOP_SPACE_RATIO = 0.2;
const RECONNECT_DELAY = 600;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.localColor = null;
  }

  init(data) {
    this.session = data?.session ?? null;
    this.localColor = data?.localColor ?? null;
    this.awaitingResolve = false;
    this.cardTargeting = false;
    this.isShuttingDown = false;
    this.handedOff = false;
    this.isExiting = false;
    this.reconnectPending = false;
    this.reconnectTimer = null;
    this.connectionOverlay = null;
  }

  create() {
    this.session = this.session ?? new GameSession({ role: 'local' });
    this.logic = this.session.game;
    saveSession(this.session);

    this.pieceViews = new Map();
    this.selectedPiece = null;
    this.boardView = new BoardView(this);
    this.boardView.flipped = this.localColor === 'black';
    this.boardView.onCellClick = (col, row) => this.onCellClick(col, row);
    this.boardView.onCellHover = (col, row, over) =>
      this.onCellHover(col, row, over);

    this.layoutBoard();
    this.syncViewsFromState(this.session.toState());

    this.input.on('dragstart', (pointer, gameObject) => this.dragStart(gameObject));

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => this.drag(gameObject, dragX, dragY));

    this.input.on('dragend', (pointer, gameObject) => this.dragEnd(gameObject));

    this.scale.on('resize', this.layoutBoard, this);

    this.events.on('ui:end-turn', this.endTurn, this);

    this.events.once('shutdown', () => {
      this.isShuttingDown = true;
      this.scale.off('resize', this.layoutBoard, this);
      this.events.off('ui:end-turn', this.endTurn, this);
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.unsubscribe?.();
      this.unsubscribeStatus?.();
      this.connectionOverlay?.destroy(true);
      this.connectionOverlay = null;

      if (!this.handedOff) {
        this.session?.dispose?.();
      }

      this.session = null;
      this.logic = null;
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

    this.unsubscribe = this.session.subscribe((resolved) => this.onResolved(resolved));
    this.unsubscribeStatus = this.session.onStatus((status, detail) =>
      this.onConnectionStatus(status, detail)
    );

    this.syncViewsFromState(this.session.toState());

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
    const boardSize = Math.min(width, height * BOARD_HEIGHT_RATIO);
    const cellSize = Math.floor(boardSize / 8);
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

    this.layoutConnectionOverlay();
  }

  addPieceView(piece) {
    const view = new PieceView(this, piece, this.cellSize);
    this.placePieceView(view);

    view.on('pointerdown', () => {
      if (this.cardTargeting) {
        return;
      }

      const current = this.logic.getPieceById(view.piece.id);
      if (!current || !this.canControl(current)) {
        return;
      }
      this.selectPiece(current);
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
    this.logic = this.session.game;
    saveSession(this.session);
    this.setAwaitingResolve(false);

    if (!resolved?.ok) {
      this.clearSelection();
      this.syncViewsFromState(this.session.toState());
      return;
    }

    this.clearSelection();
    this.scene.get('BottomUiScene')?.cancelCardTargeting?.();

    if (resolved.result === 'move') {
      this.sound.play('move');
    }

    if (resolved.result === 'kill') {
      this.sound.play('kill');
    }

    for (const event of resolved.events ?? []) {
      if (event.type === 'attack') {
        this.addSplash({
          col: event.col,
          row: event.row,
          color: event.color,
        });
      }
    }

    this.syncViewsFromState(resolved.state);
  }

  dragStart(gameObject) {
    if (!gameObject?.piece || this.cardTargeting) {
      return;
    }

    gameObject.setData('startX', gameObject.x);
    gameObject.setData('startY', gameObject.y);

    if (!this.canControl(gameObject.piece)) {
      return;
    }

    this.children.bringToTop(gameObject);
  }

  drag(gameObject, dragX, dragY) {
    if (
      !gameObject?.piece ||
      this.cardTargeting ||
      !this.canControl(gameObject.piece)
    ) {
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

    if (this.cardTargeting) {
      resetPosition();
      return;
    }

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

    if (result.pending) {
      resetPosition();
      this.setAwaitingResolve(true);
      this.clearSelection();
      return;
    }

    this.clearSelection();
  }

  performAction(piece, col, row) {
    if (!piece || !this.canControl(piece)) {
      return false;
    }

    const result = this.session.dispatch(moveAction(piece.id, col, row));

    if (result.pending) {
      this.setAwaitingResolve(true);
    }

    return Boolean(result?.ok);
  }

  playCard(cardUid, col, row) {
    if (!this.session || this.awaitingResolve) {
      return { ok: false, reason: 'pending' };
    }

    if (this.localColor && this.localColor !== this.logic.turn) {
      return { ok: false, reason: 'not-your-turn' };
    }

    this.clearSelection();

    const result = this.session.dispatch(playCardAction(cardUid, col, row));

    if (result.pending) {
      this.setAwaitingResolve(true);
    }

    return result;
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
    if (this.awaitingResolve) {
      return;
    }

    if (this.localColor && this.localColor !== this.logic.turn) {
      return;
    }

    this.scene.get('BottomUiScene')?.cancelCardTargeting?.();
    this.clearSelection();

    const result = this.session.dispatch(endTurnAction());

    if (result.pending) {
      this.setAwaitingResolve(true);
    }
  }

  onCellClick(col, row) {
    const ui = this.scene.get('BottomUiScene');

    if (ui?.selectedCardUid) {
      ui.onTargetCellClick?.(col, row);
      return;
    }

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

  onCellHover(col, row, over) {
    if (!this.cardTargeting) {
      return;
    }

    this.scene
      .get('BottomUiScene')
      ?.onBoardCellHover?.(col, row, over);
  }

  setCardTargetingMode(active) {
    const next = Boolean(active);

    if (this.cardTargeting === next) {
      return;
    }

    this.cardTargeting = next;

    if (next) {
      this.selectedPiece = null;
      this.boardView.clearHighlights();
    }

    this.syncInputs();
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

  canControl(piece) {
    if (!piece || this.awaitingResolve || this.cardTargeting) {
      return false;
    }

    if (this.localColor) {
      return piece.color === this.localColor && piece.color === this.logic.turn;
    }

    return piece.color === this.logic.turn;
  }

  setAwaitingResolve(value) {
    this.awaitingResolve = value;
    this.syncInputs();
    this.events.emit('ui:pending', value);
  }

  syncInputs() {
    for (const view of this.pieceViews.values()) {
      if (view.input) {
        view.input.enabled = this.canControl(view.piece);
      }
    }
  }

  onConnectionStatus(status, detail) {
    if (
      this.isShuttingDown ||
      this.handedOff ||
      this.isExiting ||
      this.reconnectPending ||
      this.connectionOverlay?.terminal
    ) {
      return;
    }

    if (status === 'closed') {
      if (detail === 'left') {
        this.showTerminal(
          this.session?.role === 'guest'
            ? 'Хост закрыл комнату'
            : 'Игрок вышел'
        );
        return;
      }

      if (detail === 'room-full') {
        this.showTerminal('Комната уже занята');
        return;
      }

      this.scheduleReconnect();
      return;
    }

    if (status !== 'error' && status !== 'disconnected') {
      return;
    }

    if (this.session?.transport?.conn?.open) {
      return;
    }

    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectPending || this.handedOff || this.isExiting) {
      return;
    }

    this.reconnectPending = true;
    saveSession(this.session);
    this.prepareOverlay();
    this.showConnectionOverlay('Переподключение...');
    this.reconnectTimer = setTimeout(() => this.startReconnect(), RECONNECT_DELAY);
  }

  startReconnect() {
    this.reconnectTimer = null;

    const saved = loadSession();
    if (!saved) {
      this.reconnectPending = false;
      this.showTerminal('Сессия не найдена');
      return;
    }

    this.handedOff = true;
    this.unsubscribe?.();
    this.unsubscribeStatus?.();
    this.unsubscribe = null;
    this.unsubscribeStatus = null;

    const session = this.session;
    this.session = null;
    this.logic = null;
    session?.dispose?.();

    this.scene.start('LobbyScene', {
      mode: saved.role === 'host' ? 'host' : 'join',
      code: saved.code,
      resume: saved,
    });
  }

  showTerminal(message) {
    clearSession();
    this.reconnectPending = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.prepareOverlay();
    this.showConnectionOverlay(message, 'В меню', () => this.exitToHome());
    this.connectionOverlay.terminal = true;
  }

  prepareOverlay() {
    this.scene.stop('BottomUiScene');
    this.setAwaitingResolve(true);
    this.clearSelection();
  }

  showConnectionOverlay(message, buttonLabel = null, onClick = null) {
    if (this.connectionOverlay) {
      this.connectionOverlayText?.setText(message);

      if (buttonLabel && onClick && !this.connectionOverlayButton) {
        const button = new ButtonView(this, buttonLabel, 160, 44, onClick);
        this.connectionOverlay.add(button);
        this.connectionOverlayButton = button;
        this.layoutConnectionOverlay();
      }

      return;
    }

    const overlay = this.add.container(0, 0).setDepth(1000);
    const background = this.add.rectangle(0, 0, 1, 1, 0x000000, 0.72).setOrigin(0);
    const text = this.add
      .text(0, 0, message, {
        fontFamily: 'Arial',
        fontSize: '28px',
        color: '#ffd166',
        align: 'center',
      })
      .setOrigin(0.5);

    overlay.add([background, text]);
    this.connectionOverlay = overlay;
    this.connectionOverlayBackground = background;
    this.connectionOverlayText = text;
    this.connectionOverlayButton = null;

    if (buttonLabel && onClick) {
      const button = new ButtonView(this, buttonLabel, 160, 44, onClick);
      overlay.add(button);
      this.connectionOverlayButton = button;
    }

    this.layoutConnectionOverlay();
  }

  layoutConnectionOverlay() {
    if (!this.connectionOverlay) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const textY = this.connectionOverlayButton ? height / 2 - 40 : height / 2;

    this.connectionOverlayBackground.setSize(width, height);
    this.connectionOverlayText.setPosition(width / 2, textY);
    this.connectionOverlayButton?.layout(width / 2, height / 2 + 20);
  }

  exitToHome() {
    if (this.isExiting) {
      return;
    }

    this.isExiting = true;
    this.handedOff = true;
    this.reconnectPending = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    clearSession();

    const session = this.session;
    this.session = null;
    this.logic = null;
    session?.dispose?.('left');

    this.scene.start('HomeScene');
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
