import Phaser from 'phaser';
import ButtonView from '../render/ButtonView.js';
import CardView from '../render/CardView.js';
import { computeFanLayout } from '../render/cardFan.js';
import {
  findCardDefinition,
  getCardCatalog,
} from '../game/deck.js';

const END_TURN_BUTTON_WIDTH = 90;
const END_TURN_BUTTON_HEIGHT = 35;
const END_TURN_BUTTON_TOP = 12;

const TEMPO_RADIUS = 10;
const TEMPO_SPACING = 20;
const TEMPO_PADDING = 30;

const EXIT_BUTTON_WIDTH = 76;
const EXIT_BUTTON_HEIGHT = 28;
const EXIT_BUTTON_TOP = END_TURN_BUTTON_TOP + END_TURN_BUTTON_HEIGHT + 10;

const HAND_TOP_PADDING = 88;
const HAND_BOTTOM_PADDING = 8;
const CARD_SIDE_RESERVE = 112;
const CARD_NARROW_SIDE_RESERVE = 14;
const CARD_PILES_MIN_WIDTH = 720;

const CARD_BASE_DEPTH = 200;
const CARD_HOVER_DEPTH = 400;
const CARD_DRAG_DEPTH = 500;
const CARD_EVAPORATE_DEPTH = 600;
const CARD_PILE_DEPTH = 150;

const DECK_CARD_WIDTH = 44;
const DECK_CARD_HEIGHT = 60;

const CARD_FONT = '"DotumChe", monospace';

export class BottomUiScene extends Phaser.Scene {
  constructor() {
    super('BottomUiScene');
  }

  init(data) {
    this.boardBottomY = data.boardBottomY ?? 0;
    this.session = data.session ?? null;
    this.awaitingResolve = false;

    this.cardCatalog = getCardCatalog();
    this.handViews = new Map();
    this.handOrder = [];
    this.handSignature = null;
    this.handColor = null;
    this.currentState = null;
    this.hoveredCard = null;
    this.draggingCard = null;
    this.pressedCard = null;
    this.cardDragOffset = null;
    this.cardTargetCell = null;
    this.pendingState = null;
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

    this.exitButton = new ButtonView(
      this,
      'Выйти',
      EXIT_BUTTON_WIDTH,
      EXIT_BUTTON_HEIGHT,
      () => {
        if (window.confirm('Выйти в меню?')) {
          this.scene.get('GameScene')?.exitToHome?.();
        }
      }
    );

    this.turnText = this.add.text(0, 0, '', {
      fontFamily: CARD_FONT,
      fontSize: '16px',
      color: '#ffd166',
    }).setOrigin(0, 0.5);

    this.tempoContainer = this.add.container(0, 0);
    this.tempoCircles = [];

    this.panel.add([
      this.background,
      this.topLine,
      this.endTurnButton,
      this.turnText,
      this.tempoContainer,
      this.exitButton,
    ]);

    this.gameScene = this.scene.get('GameScene');
    this.boardBottomY = this.gameScene?.uiY ?? this.boardBottomY;
    this.awaitingResolve = Boolean(this.gameScene?.awaitingResolve);
    this.gameScene?.events.on('ui:pending', this.onPending, this);

    this.createCardSparkTexture();
    this.createCardPiles();

    this.input.on('dragstart', this.onCardDragStart, this);
    this.input.on('drag', this.onCardDrag, this);
    this.input.on('dragend', this.onCardDragEnd, this);
    this.input.on('pointerup', this.onScenePointerRelease, this);
    this.input.on('pointerupoutside', this.onScenePointerRelease, this);

    this.layout(this.boardBottomY);

    if (this.session) {
      this.unsubscribe = this.session.subscribe((resolved) => {
        const state = resolved?.state ?? this.session.toState();
        this.updateTempo(state);
        this.updateCards(state);
      });
      const state = this.session.toState();
      this.updateTempo(state);
      this.updateCards(state);
    } else {
      this.updateCards(null);
    }

    this.events.once('shutdown', () => {
      this.unsubscribe?.();
      this.gameScene?.events.off('ui:pending', this.onPending, this);
      this.input.off('dragstart', this.onCardDragStart, this);
      this.input.off('drag', this.onCardDrag, this);
      this.input.off('dragend', this.onCardDragEnd, this);
      this.input.off('pointerup', this.onScenePointerRelease, this);
      this.input.off('pointerupoutside', this.onScenePointerRelease, this);
      this.clearCardTarget();
      this.handViews?.clear();
      this.draggingCard = null;
      this.pressedCard = null;
      this.hoveredCard = null;
    });
  }

  createCardSparkTexture() {
    if (this.textures.exists('card-spark')) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffd166, 1);
    graphics.fillRect(0, 0, 5, 5);
    graphics.generateTexture('card-spark', 5, 5);
    graphics.destroy();
  }

  createCardPiles() {
    this.deckPile = this.add.container(0, 0).setDepth(CARD_PILE_DEPTH);

    const backKey = this.cardCatalog.back;

    for (let index = 2; index >= 0; index -= 1) {
      let back;

      if (backKey && this.textures.exists(backKey)) {
        back = new Phaser.GameObjects.Image(
          this,
          index * 2,
          -index * 2,
          backKey
        ).setOrigin(0.5, 1);

        back.setDisplaySize(DECK_CARD_WIDTH, DECK_CARD_HEIGHT);
      } else {
        back = new Phaser.GameObjects.Rectangle(
          this,
          index * 2,
          -index * 2,
          DECK_CARD_WIDTH,
          DECK_CARD_HEIGHT,
          0x24140c
        )
          .setOrigin(0.5, 1)
          .setStrokeStyle(2, 0x8a4f1d);
      }

      back.setRotation((index - 1) * 0.03);
      this.deckPile.add(back);
    }

    this.deckCountText = new Phaser.GameObjects.Text(this, 0, -70, '', {
      fontFamily: CARD_FONT,
      fontSize: '12px',
      color: '#ffd166',
      align: 'center',
    }).setOrigin(0.5, 1);

    this.deckPile.add(this.deckCountText);

    this.discardText = this.add
      .text(0, 0, '', {
        fontFamily: CARD_FONT,
        fontSize: '12px',
        color: '#9aa0b4',
        align: 'right',
      })
      .setOrigin(1, 1)
      .setDepth(CARD_PILE_DEPTH);
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

    this.exitButton.layout(
      this.scale.width - TEMPO_PADDING - EXIT_BUTTON_WIDTH / 2,
      EXIT_BUTTON_TOP + EXIT_BUTTON_HEIGHT / 2
    );
    this.exitButton.setVisible(
      height >= EXIT_BUTTON_TOP + EXIT_BUTTON_HEIGHT + 4
    );

    if (this.turnText) {
      this.turnText.setPosition(
        TEMPO_PADDING / 2,
        END_TURN_BUTTON_TOP + END_TURN_BUTTON_HEIGHT / 2
      );
    }

    this.updateTempoLayout();
    this.layoutCardPiles(height);
    this.layoutHand(false);
  }

  layoutCardPiles(panelHeight) {
    if (!this.deckPile) {
      return;
    }

    const visible =
      panelHeight >= 120 && this.scale.width >= CARD_PILES_MIN_WIDTH;

    this.deckPile.setVisible(visible);
    this.discardText.setVisible(visible);
    this.deckPile.setPosition(54, this.scale.height - 12);
    this.discardText.setPosition(
      this.scale.width - 16,
      this.scale.height - 14
    );
  }

  updateTempo(state) {
    if (!state) {
      return;
    }

    const maxTempo = Math.max(1, state.maxTempo ?? 1);
    const currentTurn = state.turn ?? 'white';
    const tempo = state.heroes?.[currentTurn]?.tempo ?? maxTempo;

    this.updateTurnControls(state);

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

  updateCards(state) {
    if (this.draggingCard) {
      this.pendingState = state;
      this.syncCardPiles(state);
      return;
    }

    if (!state) {
      this.currentState = null;
      this.clearHand();
      this.syncCardPiles(null);
      return;
    }

    this.currentState = state;

    const color = this.session?.localColor ?? state.turn ?? 'white';
    const hand = state.cards?.hands?.[color] ?? [];
    const signature = `${color}|${hand.map((card) => card.uid).join('|')}`;

    if (signature !== this.handSignature) {
      this.handSignature = signature;
      this.rebuildHand(color, hand);
    } else {
      this.syncCardPlayability();
    }

    this.syncCardPiles(state);
    this.layoutHand(false);
  }

  clearHand() {
    this.hoveredCard = null;
    this.pressedCard = null;
    this.handOrder = [];
    this.handSignature = null;

    for (const card of this.handViews.values()) {
      this.tweens.killTweensOf(card);
      card.destroy();
    }

    this.handViews.clear();
  }

  rebuildHand(color, hand) {
    this.hoveredCard = null;
    this.pressedCard = null;
    this.handColor = color;
    this.handOrder = hand.map((card) => card.uid);

    for (const card of this.handViews.values()) {
      this.tweens.killTweensOf(card);
      card.destroy();
    }

    this.handViews.clear();

    hand.forEach((instance, index) => {
      const definition = findCardDefinition(instance.cardId) ?? {
        id: instance.cardId,
        name: 'Неизвестная карта',
        text: '',
        cost: 0,
        art: '',
      };
      const card = new CardView(
        this,
        instance,
        definition,
        this.cardCatalog.template
      );

      card.homeDepth = CARD_BASE_DEPTH + index;
      this.bindCardEvents(card);
      this.handViews.set(instance.uid, card);
    });

    this.syncCardPlayability();
    this.layoutHand(true);
  }

  bindCardEvents(card) {
    card.on('pointerover', () => this.onCardHover(card, true));
    card.on('pointerout', () => this.onCardHover(card, false));
    card.on('pointerdown', () => this.onCardPress(card));
    card.on('pointerup', (pointer) => this.onCardRelease(card, pointer));
  }

  canPlayCards(state = this.currentState) {
    if (!state || this.awaitingResolve) {
      return false;
    }

    const localColor = this.session?.localColor ?? null;

    if (localColor) {
      return state.turn === localColor;
    }

    return true;
  }

  syncCardPlayability() {
    const playable = this.canPlayCards();
    const turn = this.currentState?.turn ?? 'white';
    const tempo = this.currentState?.heroes?.[turn]?.tempo ?? 0;

    for (const card of this.handViews.values()) {
      const cost = card.definition?.cost ?? 0;
      card.setPlayable(
        playable && !card.evaporating && cost <= tempo
      );
    }
  }

  syncCardPiles(state) {
    if (!this.deckPile) {
      return;
    }

    const deckCount = state?.cards?.deck?.length ?? 0;
    const discardCount = state?.cards?.discard?.length ?? 0;

    this.deckCountText.setText(`Колода ${deckCount}`);
    this.discardText.setText(`Сброс ${discardCount}`);
    this.deckPile.setAlpha(deckCount > 0 ? 1 : 0.45);
  }

  layoutHand(snap) {
    if (this.handOrder.length === 0) {
      this.handLayout = null;
      return;
    }

    const layout = computeFanLayout({
      count: this.handOrder.length,
      width: this.scale.width,
      height: this.scale.height,
      panelTop: this.boardBottomY,
      topPadding: HAND_TOP_PADDING,
      bottomPadding: HAND_BOTTOM_PADDING,
      sideReserve:
        this.scale.width >= CARD_PILES_MIN_WIDTH
          ? CARD_SIDE_RESERVE
          : CARD_NARROW_SIDE_RESERVE,
    });

    this.handLayout = layout;

    this.handOrder.forEach((uid, index) => {
      const card = this.handViews.get(uid);

      if (!card) {
        return;
      }

      const slot = layout.slots[index];

      card.setHome({
        x: slot.x,
        y: slot.y,
        rotation: slot.rotation,
        scale: slot.scale,
        depth: CARD_BASE_DEPTH + index,
      });

      if (this.draggingCard === card) {
        return;
      }

      if (snap) {
        card.snapHome();
        return;
      }

      if (this.hoveredCard === card) {
        this.hoveredCard = null;
        this.onCardHover(card, true);
        return;
      }

      if (!card.pressed) {
        this.homeCard(card, 160);
      }
    });
  }

  onCardHover(card, over) {
    if (this.draggingCard || card.evaporating) {
      return;
    }

    if (over) {
      if (
        this.hoveredCard &&
        this.hoveredCard !== card &&
        !this.hoveredCard.pressed
      ) {
        const previous = this.hoveredCard;
        this.hoveredCard = null;
        this.homeCard(previous, 120);
      }

      this.hoveredCard = card;
      card.setDepth(CARD_HOVER_DEPTH);
      this.tweenCard(
        card,
        {
          x: card.homeX,
          y: card.homeY - 14,
          rotation: card.homeRotation * 0.15,
          scale: this.hoverScale(card),
        },
        120
      );
      return;
    }

    if (this.hoveredCard !== card || card.pressed) {
      return;
    }

    this.hoveredCard = null;
    this.homeCard(card, 140);
  }

  onCardPress(card) {
    if (this.draggingCard || card.evaporating) {
      return;
    }

    if (this.pressedCard && this.pressedCard !== card) {
      this.onCardRelease(this.pressedCard, null, true);
    }

    card.pressed = true;
    this.pressedCard = card;
    this.hoveredCard = card;
    card.setDepth(CARD_HOVER_DEPTH + 5);
    this.tweenCard(
      card,
      {
        x: card.homeX,
        y: card.homeY - 20,
        rotation: 0,
        scale: this.pressScale(card),
      },
      100
    );
  }

  hoverScale(card) {
    return Math.max(
      card.homeScale * 1.1,
      Math.min(0.85, card.homeScale * 1.3)
    );
  }

  pressScale(card) {
    return Math.max(
      card.homeScale * 1.14,
      Math.min(0.95, card.homeScale * 1.6)
    );
  }

  onCardRelease(card, pointer, forceHome = false) {
    if (this.draggingCard === card || !card.pressed) {
      if (this.pressedCard === card) {
        this.pressedCard = null;
      }
      return;
    }

    if (this.pressedCard === card) {
      this.pressedCard = null;
    }

    card.pressed = false;

    if (!forceHome && !pointer?.wasTouch && card.hovered && !card.evaporating) {
      this.hoveredCard = null;
      this.onCardHover(card, true);
      return;
    }

    card.hovered = false;

    if (this.hoveredCard === card) {
      this.hoveredCard = null;
    }

    this.homeCard(card, 140);
  }

  onScenePointerRelease(pointer) {
    const card = this.pressedCard;

    if (!card) {
      return;
    }

    this.onCardRelease(card, pointer, true);
  }

  onCardDragStart(pointer, gameObject) {
    const card = gameObject;

    if (!card?.isCardView || card.evaporating || this.draggingCard) {
      return;
    }

    if (!card.playable || !this.canPlayCards()) {
      return;
    }

    this.draggingCard = card;
    this.pressedCard = null;
    this.pendingState = null;
    this.cardDragOffset = {
      x: pointer.x - card.x,
      y: pointer.y - card.y,
    };

    this.clearCardTarget();
    this.gameScene?.clearSelection?.();

    if (this.hoveredCard === card) {
      this.hoveredCard = null;
    }

    card.pressed = false;
    card.hovered = false;
    this.tweens.killTweensOf(card);
    card.setDepth(CARD_DRAG_DEPTH);
    card.setRotation(0);
    card.setScale(Math.max(card.homeScale * 1.12, card.scaleX));

    this.gameScene?.events.emit('ui:card-drag', {
      active: true,
      cardId: card.definition.id,
    });
  }

  onCardDrag(pointer, gameObject) {
    if (gameObject !== this.draggingCard) {
      return;
    }

    const offset = this.cardDragOffset ?? { x: 0, y: 0 };

    gameObject.setPosition(pointer.x - offset.x, pointer.y - offset.y);
    this.setCardTarget(this.resolveCardTarget(gameObject, pointer));
  }

  onCardDragEnd(pointer, gameObject) {
    if (gameObject !== this.draggingCard) {
      return;
    }

    const card = gameObject;
    this.draggingCard = null;
    this.cardDragOffset = null;
    this.gameScene?.events.emit('ui:card-drag', { active: false });

    if (!card) {
      this.clearCardTarget();
      return;
    }

    const target = this.resolveCardTarget(card, pointer);
    this.clearCardTarget();
    const canPlay = card.playable && this.canPlayCards();

    if (target && canPlay) {
      this.pendingState = null;
      this.playCardFromHand(card, target);
      return;
    }

    this.homeCard(card, 200);

    const pending = this.pendingState;
    this.pendingState = null;

    if (pending) {
      this.updateCards(pending);
    }
  }

  resolveCardTarget(card, pointer) {
    const cardCenterX = card.x;
    const cardCenterY = card.y - card.displayHeight / 2;

    return (
      this.boardTargetAt(cardCenterX, cardCenterY) ??
      this.boardTargetAt(pointer.x, pointer.y)
    );
  }

  setCardTarget(target) {
    const nextCell =
      target && this.gameScene?.boardView?.cellAt(target.col, target.row);

    if (nextCell === this.cardTargetCell) {
      return;
    }

    this.cardTargetCell?.clearHighlight();
    this.cardTargetCell = nextCell ?? null;
    this.cardTargetCell?.showHighlight('selected');
  }

  clearCardTarget() {
    this.cardTargetCell?.clearHighlight();
    this.cardTargetCell = null;
  }

  boardTargetAt(x, y) {
    const board = this.gameScene?.boardView;

    if (!board) {
      return null;
    }

    const size = board.cellSize * 8;

    if (
      x < board.originX ||
      x >= board.originX + size ||
      y < board.originY ||
      y >= board.originY + size
    ) {
      return null;
    }

    const cell = board.worldToCell(x, y);

    if (cell.col < 0 || cell.col > 7 || cell.row < 0 || cell.row > 7) {
      return null;
    }

    return cell;
  }

  playCardFromHand(card, target) {
    const uid = card.card.uid;
    const gameScene = this.gameScene;

    if (!gameScene?.playCard) {
      this.homeCard(card, 200);
      return;
    }

    this.handViews.delete(uid);
    this.handOrder = this.handOrder.filter((id) => id !== uid);
    this.hoveredCard = null;
    this.layoutHand(false);

    const result = gameScene.playCard(uid, target.col, target.row);

    if (!result || (!result.ok && !result.pending)) {
      this.tweens.killTweensOf(card);
      card.destroy();
      this.handSignature = null;
      this.updateCards(this.session?.toState());
      return;
    }

    if (!card.active) {
      return;
    }

    card.evaporating = true;
    card.playable = false;
    card.disableInteractive();
    card.setDepth(CARD_EVAPORATE_DEPTH);
    this.tweens.killTweensOf(card);
    this.spawnEvaporation(card, target);
  }

  spawnEvaporation(card, target) {
    const centerX = card.x;
    const centerY = card.y - card.displayHeight / 2;
    const emitter = this.add
      .particles(centerX, centerY, 'card-spark', {
        speed: { min: 20, max: 110 },
        angle: { min: 220, max: 320 },
        gravityY: -80,
        lifespan: { min: 380, max: 820 },
        scale: { start: 1.2, end: 0 },
        alpha: { start: 0.85, end: 0 },
        rotate: { min: 0, max: 360 },
        emitting: false,
        maxParticles: 40,
      })
      .setDepth(CARD_EVAPORATE_DEPTH - 1);

    emitter.explode(26);

    const board = this.gameScene?.boardView;
    const cell = board?.cellToWorld(target.col, target.row);

    if (cell) {
      const burst = this.add
        .particles(cell.x, cell.y, 'card-spark', {
          speed: { min: 40, max: 150 },
          angle: { min: 0, max: 360 },
          gravityY: 180,
          lifespan: { min: 260, max: 620 },
          scale: { start: 1, end: 0 },
          alpha: { start: 0.9, end: 0 },
          emitting: false,
          maxParticles: 24,
        })
        .setDepth(CARD_EVAPORATE_DEPTH - 2);

      burst.explode(18);
      this.time.delayedCall(800, () => burst.destroy());
    }

    this.tweens.add({
      targets: card,
      alpha: 0,
      y: card.y - 54,
      scaleX: card.scaleX * 1.12,
      scaleY: card.scaleY * 1.12,
      rotation: card.rotation + 0.04,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => card.destroy(),
    });

    this.time.delayedCall(950, () => emitter.destroy());
  }

  tweenCard(card, { x, y, rotation, scale }, duration) {
    if (!card || !card.active) {
      return;
    }

    this.tweens.killTweensOf(card);
    this.tweens.add({
      targets: card,
      x,
      y,
      rotation,
      scaleX: scale,
      scaleY: scale,
      duration,
      ease: 'Cubic.easeOut',
    });
  }

  homeCard(card, duration) {
    if (!card || !card.active || card.evaporating) {
      return;
    }

    card.pressed = false;
    this.tweens.killTweensOf(card);
    card.setDepth(card.homeDepth);

    if (duration <= 0) {
      card.snapHome();
      return;
    }

    this.tweens.add({
      targets: card,
      x: card.homeX,
      y: card.homeY,
      rotation: card.homeRotation,
      scaleX: card.homeScale,
      scaleY: card.homeScale,
      duration,
      ease: 'Cubic.easeOut',
    });
  }

  onPending(value) {
    this.awaitingResolve = Boolean(value);
    this.updateTurnControls(this.session?.toState() ?? { turn: null });
    this.syncCardPlayability();
  }

  updateTurnControls(state) {
    if (!this.endTurnButton) {
      return;
    }

    const localColor = this.session?.localColor ?? null;
    const canEndTurn =
      !this.awaitingResolve && (!localColor || state.turn === localColor);
    this.endTurnButton.setEnabled(canEndTurn);

    if (this.turnText) {
      if (localColor) {
        this.turnText.setText(canEndTurn ? 'Твой ход' : 'Ход соперника');
      } else {
        this.turnText.setText(
          state.turn === 'white' ? 'Ход: белые' : 'Ход: чёрные'
        );
      }
    }
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
