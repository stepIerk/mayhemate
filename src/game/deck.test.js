import { describe, it, expect, afterEach } from 'vitest';
import {
  CARD_HAND_SIZE,
  CardState,
  MAX_HAND_SIZE,
  normalizeCardCatalog,
  setCardCatalog,
} from './deck.js';
import { Game } from './Game.js';
import { endTurnAction, playCardAction } from './actions.js';

const DEFINITIONS = [
  { id: 'spark', name: 'Искра', cost: 1, copies: 6, art: 'spark.png' },
  { id: 'shield', name: 'Щит', cost: 2, copies: 6, art: 'shield.png' },
];

afterEach(() => {
  setCardCatalog(null);
});

describe('card catalog', () => {
  it('normalizes cards and skips invalid entries', () => {
    const catalog = normalizeCardCatalog({
      template: 'template.png',
      back: 'back.png',
      cards: [
        { id: 'one', name: 'One', cost: '2', copies: 3 },
        { id: 'one', name: 'Duplicate', cost: 1 },
        { name: 'Two' },
        null,
      ],
    });

    expect(catalog.template).toBe('template.png');
    expect(catalog.back).toBe('back.png');
    expect(catalog.cards).toHaveLength(2);
    expect(catalog.cards[0]).toMatchObject({
      id: 'one',
      name: 'One',
      cost: 2,
      copies: 3,
    });
    expect(catalog.cards[1]).toMatchObject({
      id: 'two',
      name: 'Two',
      cost: 1,
      copies: 1,
    });
  });
});

describe('CardState', () => {
  it('builds a shared deck and deals opening hands', () => {
    const state = CardState.create(DEFINITIONS, { seed: 7 });

    expect(state.hands.white).toHaveLength(CARD_HAND_SIZE);
    expect(state.hands.black).toHaveLength(CARD_HAND_SIZE);
    expect(state.deck).toHaveLength(
      12 - CARD_HAND_SIZE * 2
    );
    expect(state.discard).toHaveLength(0);
  });

  it('moves a played card from hand to discard', () => {
    const state = CardState.create(DEFINITIONS, { seed: 7 });
    const card = state.hands.white[0];
    const played = state.play('white', card.uid, { col: 3, row: 4 });

    expect(played).toMatchObject({
      uid: card.uid,
      cardId: card.cardId,
      by: 'white',
      target: { col: 3, row: 4 },
    });
    expect(state.hands.white).toHaveLength(CARD_HAND_SIZE - 1);
    expect(state.discard).toHaveLength(1);
    expect(state.hasInHand('white', card.uid)).toBe(false);
  });

  it('round-trips through serialized state', () => {
    const state = CardState.create(DEFINITIONS, { seed: 7 });
    state.play('white', state.hands.white[0].uid, { col: 0, row: 0 });

    const restored = CardState.fromState(state.toState(), DEFINITIONS);

    expect(restored.toState()).toEqual(state.toState());
  });
});

describe('Game card actions', () => {
  it('plays a card from the current players hand and spends its cost in tempo', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    game.setTempo('white', 5);
    const card = game.cards.hands.white[0];
    const cost = card.cardId === 'shield' ? 2 : 1;
    const before = game.getTempo('white');
    const result = game.applyAction(
      playCardAction(card.uid, 3, 4)
    );

    expect(result.ok).toBe(true);
    expect(result.result).toBe('card');
    expect(result.events[0]).toMatchObject({
      type: 'card',
      cardUid: card.uid,
      color: 'white',
      col: 3,
      row: 4,
    });
    expect(game.cards.discard).toHaveLength(1);
    expect(game.cards.hands.white).toHaveLength(CARD_HAND_SIZE - 1);
    expect(game.getTempo('white')).toBe(before - cost);
  });

  it('rejects a card that costs more than the remaining tempo', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    game.setTempo('white', 0);
    const card = game.cards.hands.white[0];
    const result = game.applyAction(
      playCardAction(card.uid, 3, 4)
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-tempo');
    expect(game.hasCard('white', card.uid)).toBe(true);
    expect(game.getTempo('white')).toBe(0);
  });

  it('does not let the wrong player play a card', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    const blackCard = game.cards.hands.black[0];
    const result = game.applyAction(
      playCardAction(blackCard.uid, 3, 4)
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('card-not-in-hand');
  });

  it('restores card hands through the game state', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    game.setTempo('white', 5);
    game.applyAction(
      playCardAction(game.cards.hands.white[0].uid, 3, 4)
    );

    const restored = Game.fromState(game.toState());

    expect(restored.cards.toState()).toEqual(game.cards.toState());
    expect(restored.getTempo('white')).toBe(game.getTempo('white'));
  });

  it('rejects targets outside the board', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    const card = game.cards.hands.white[0];
    const result = game.applyAction(
      playCardAction(card.uid, 8, 0)
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-target');
    expect(game.hasCard('white', card.uid)).toBe(true);
  });
});

describe('drawing cards', () => {
  it('starts each player with three cards', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();

    expect(game.cards.hands.white).toHaveLength(3);
    expect(game.cards.hands.black).toHaveLength(3);
    expect(CARD_HAND_SIZE).toBe(3);
  });

  it('draws one card for the player starting a new turn', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    const whiteBefore = game.cards.hands.white.length;
    const blackBefore = game.cards.hands.black.length;

    game.applyAction(endTurnAction());

    expect(game.turn).toBe('black');
    expect(game.cards.hands.black).toHaveLength(blackBefore + 1);
    expect(game.cards.hands.white).toHaveLength(whiteBefore);

    game.applyAction(endTurnAction());

    expect(game.turn).toBe('white');
    expect(game.cards.hands.white).toHaveLength(whiteBefore + 1);
  });

  it('stops drawing once the hand is full', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    game.cards.hands.white = Array.from({ length: MAX_HAND_SIZE }, (_, i) => ({
      uid: `spark#${i}`,
      cardId: 'spark',
    }));
    game.cards.hands.black = Array.from({ length: MAX_HAND_SIZE }, (_, i) => ({
      uid: `shield#${i}`,
      cardId: 'shield',
    }));

    for (let i = 0; i < 4; i += 1) {
      game.applyAction(endTurnAction());
    }

    expect(game.cards.hands.white).toHaveLength(MAX_HAND_SIZE);
    expect(game.cards.hands.black).toHaveLength(MAX_HAND_SIZE);
  });

  it('draws nothing when the deck is empty', () => {
    setCardCatalog({ cards: DEFINITIONS });

    const game = new Game();
    game.cards.deck = [];

    game.applyAction(endTurnAction());

    expect(game.cards.hands.black).toHaveLength(3);
  });
});
