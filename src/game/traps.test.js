import { describe, it, expect, afterEach } from 'vitest';
import { Game } from './Game.js';
import {
  destroyTraps,
  hasTrap,
  placeTrap,
  placeRandomTraps,
  revealTraps,
} from './traps.js';
import { setCardCatalog } from './deck.js';
import { playCardAction } from './actions.js';

const MINE_CARD = {
  id: 'mine',
  name: 'Мина',
  cost: 2,
  copies: 1,
  requires: { cell: 'empty' },
  effects: [{ op: 'place_trap', trap: 'mine', damage: 3 }],
};

const MINE_FIELD = {
  id: 'mine_field',
  name: 'Минное поле',
  cost: 4,
  copies: 1,
  requires: { cell: 'any' },
  effects: [
    {
      op: 'place_trap',
      trap: 'mine',
      damage: 2,
      random: { count: 3, zone: 'enemy_half' },
    },
  ],
};

const DETECTOR = {
  id: 'detector',
  name: 'Детектор',
  cost: 1,
  copies: 1,
  requires: { cell: 'any' },
  effects: [{ op: 'reveal_traps', area: 'board' }],
};

afterEach(() => {
  setCardCatalog(null);
});

function gameWithTraps() {
  const game = new Game();
  game.pieces = [];
  game.eventBuffer = [];
  return game;
}

describe('placeTrap', () => {
  it('places a hidden trap for its owner and emits trap_placed', () => {
    const game = gameWithTraps();

    const trap = placeTrap(game, {
      col: 3,
      row: 3,
      owner: 'white',
      kind: 'mine',
      params: { damage: 3 },
    });

    expect(game.traps).toHaveLength(1);
    expect(trap.revealedTo).toEqual(['white']);
    expect(trap.params.damage).toBe(3);
    expect(game.eventBuffer).toContainEqual(
      expect.objectContaining({ type: 'trap_placed', owner: 'white', col: 3, row: 3 })
    );
  });

  it('assigns unique deterministic ids', () => {
    const game = gameWithTraps();

    const first = placeTrap(game, {
      col: 1,
      row: 1,
      owner: 'white',
      kind: 'mine',
      params: {},
    });
    const second = placeTrap(game, {
      col: 2,
      row: 2,
      owner: 'black',
      kind: 'mine',
      params: {},
    });

    expect(first.id).not.toBe(second.id);
  });
});

describe('checkTraps through movement', () => {
  it('damages an enemy piece and removes the mine', () => {
    const game = gameWithTraps();
    const pawn = game.addPiece('pawn', 2, 3, 'white');
    placeTrap(game, {
      col: 2,
      row: 2,
      owner: 'black',
      kind: 'mine',
      params: { damage: 3 },
    });

    game.setTempo('white', 3);
    const result = game.applyAction({
      type: 'move',
      pieceId: pawn.id,
      col: 2,
      row: 2,
    });

    expect(result.ok).toBe(true);
    expect(pawn.hp).toBe(pawn.maxHp - 3);
    expect(hasTrap(game, 2, 2)).toBe(false);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'trap', kind: 'mine' })
    );
  });

  it('does not trigger on a friendly piece', () => {
    const game = gameWithTraps();
    const pawn = game.addPiece('pawn', 2, 3, 'white');
    placeTrap(game, {
      col: 2,
      row: 2,
      owner: 'white',
      kind: 'mine',
      params: { damage: 3 },
    });

    game.setTempo('white', 3);
    const result = game.applyAction({
      type: 'move',
      pieceId: pawn.id,
      col: 2,
      row: 2,
    });

    expect(result.ok).toBe(true);
    expect(pawn.hp).toBe(pawn.maxHp);
    expect(hasTrap(game, 2, 2)).toBe(true);
  });

  it('freezes the victim with frost_trap', () => {
    const game = gameWithTraps();
    const pawn = game.addPiece('pawn', 2, 3, 'white');
    placeTrap(game, {
      col: 2,
      row: 2,
      owner: 'black',
      kind: 'frost_trap',
      params: { turns: 2 },
    });

    game.setTempo('white', 3);
    const result = game.applyAction({
      type: 'move',
      pieceId: pawn.id,
      col: 2,
      row: 2,
    });

    expect(result.ok).toBe(true);
    expect(pawn.status.frozen).toEqual({ turns: 2 });
    expect(hasTrap(game, 2, 2)).toBe(false);
  });

  it('triggers all traps on the cell in creation order', () => {
    const game = gameWithTraps();
    const pawn = game.addPiece('pawn', 2, 3, 'white');
    placeTrap(game, {
      col: 2,
      row: 2,
      owner: 'black',
      kind: 'mine',
      params: { damage: 1 },
    });
    placeTrap(game, {
      col: 2,
      row: 2,
      owner: 'black',
      kind: 'mine',
      params: { damage: 2 },
    });

    game.setTempo('white', 3);
    game.applyAction({
      type: 'move',
      pieceId: pawn.id,
      col: 2,
      row: 2,
    });

    expect(pawn.hp).toBe(pawn.maxHp - 3);
    expect(game.traps).toHaveLength(0);
  });
});

describe('place_random traps', () => {
  it('places the requested count of distinct traps in the zone', () => {
    const game = gameWithTraps();

    const placed = placeRandomTraps(game, 'white', {
      zone: 'enemy_half',
      count: 3,
      kind: 'mine',
      params: { damage: 2 },
    });

    expect(placed).toHaveLength(3);
    expect(game.traps).toHaveLength(3);

    const cells = game.traps.map((trap) => `${trap.col},${trap.row}`);
    expect(new Set(cells).size).toBe(3);
    expect(
      game.traps.every(
        (trap) => trap.owner === 'white' && trap.row <= 3
      )
    ).toBe(true);
  });

  it('caps the count when fewer empty cells exist', () => {
    const game = gameWithTraps();
    // own_home2 for white: 16 empty cells, request only 5
    const placed = placeRandomTraps(game, 'white', {
      zone: 'own_home2',
      count: 5,
      kind: 'mine',
      params: {},
    });

    expect(placed).toHaveLength(5);
    expect(game.traps).toHaveLength(5);
    expect(
      game.traps.every((trap) => trap.row >= 6)
    ).toBe(true);

    // fill the whole zone, then ask for more
    placeRandomTraps(game, 'white', {
      zone: 'own_home2',
      count: 20,
      kind: 'mine',
      params: {},
    });

    expect(game.traps).toHaveLength(16);
  });

  it('is deterministic for the same rngState', () => {
    const first = gameWithTraps();
    first.rngState = 42;
    placeRandomTraps(first, 'white', {
      zone: 'enemy_half',
      count: 3,
      kind: 'mine',
      params: {},
    });

    const second = gameWithTraps();
    second.rngState = 42;
    placeRandomTraps(second, 'white', {
      zone: 'enemy_half',
      count: 3,
      kind: 'mine',
      params: {},
    });

    expect(first.traps.map((trap) => [trap.col, trap.row])).toEqual(
      second.traps.map((trap) => [trap.col, trap.row])
    );
  });
});

describe('destroyTrap and revealTraps', () => {
  it('removes only traps of the requested owner', () => {
    const game = gameWithTraps();
    placeTrap(game, {
      col: 3,
      row: 3,
      owner: 'white',
      kind: 'mine',
      params: {},
    });
    placeTrap(game, {
      col: 3,
      row: 3,
      owner: 'black',
      kind: 'mine',
      params: {},
    });

    const removed = destroyTraps(game, {
      col: 3,
      row: 3,
      owner: 'white',
    });

    expect(removed).toHaveLength(1);
    expect(game.traps).toHaveLength(1);
    expect(game.traps[0].owner).toBe('black');
  });

  it('reveals enemy traps only within the given cells', () => {
    const game = gameWithTraps();
    const near = placeTrap(game, {
      col: 3,
      row: 3,
      owner: 'black',
      kind: 'mine',
      params: {},
    });
    const far = placeTrap(game, {
      col: 7,
      row: 7,
      owner: 'black',
      kind: 'mine',
      params: {},
    });

    const cells = [];
    for (let row = 2; row <= 4; row += 1) {
      for (let col = 2; col <= 4; col += 1) {
        cells.push({ col, row });
      }
    }

    const revealed = revealTraps(game, 'white', cells);

    expect(revealed).toBe(1);
    expect(near.revealedTo).toContain('white');
    expect(far.revealedTo).not.toContain('white');
  });
});

describe('trap cards', () => {
  it('plays a mine card on an empty cell', () => {
    setCardCatalog({ cards: [MINE_CARD] });
    const game = new Game();
    game.setTempo('white', 5);

    const card = game.cards.hands.white[0];
    const result = game.applyAction(playCardAction(card.uid, 3, 3));

    expect(result.ok).toBe(true);
    expect(game.traps).toHaveLength(1);
    expect(game.traps[0]).toMatchObject({
      col: 3,
      row: 3,
      owner: 'white',
      kind: 'mine',
      params: { damage: 3 },
    });
    expect(game.getTempo('white')).toBe(5 - MINE_CARD.cost);
  });

  it('refuses to place a trap on an occupied cell', () => {
    setCardCatalog({ cards: [MINE_CARD] });
    const game = new Game();
    const pawn = game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'black'
    );
    game.setTempo('white', 5);

    const card = game.cards.hands.white[0];
    const result = game.applyAction(
      playCardAction(card.uid, pawn.col, pawn.row)
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-target');
    expect(game.traps).toHaveLength(0);
  });

  it('plays mine_field randomly and deterministically', () => {
    setCardCatalog({ cards: [MINE_FIELD] });
    const game = new Game();
    game.rngState = 7;
    game.setTempo('white', 5);

    const card = game.cards.hands.white[0];
    const result = game.applyAction(playCardAction(card.uid, 0, 0));

    expect(result.ok).toBe(true);
    expect(game.traps).toHaveLength(3);
    expect(
      game.traps.every(
        (trap) => trap.kind === 'mine' && trap.row <= 3
      )
    ).toBe(true);

    const other = new Game();
    other.rngState = 7;
    other.setTempo('white', 5);
    setCardCatalog({ cards: [MINE_FIELD] });
    const otherCard = other.cards.hands.white[0];
    other.applyAction(playCardAction(otherCard.uid, 0, 0));

    expect(other.traps.map((trap) => [trap.col, trap.row])).toEqual(
      game.traps.map((trap) => [trap.col, trap.row])
    );
  });

  it('reveal_traps marks enemy traps for the caster', () => {
    setCardCatalog({ cards: [DETECTOR] });
    const game = new Game();
    placeTrap(game, {
      col: 0,
      row: 0,
      owner: 'black',
      kind: 'mine',
      params: {},
    });
    game.setTempo('white', 5);

    const card = game.cards.hands.white[0];
    const result = game.applyAction(playCardAction(card.uid, 0, 0));

    expect(result.ok).toBe(true);
    expect(game.traps[0].revealedTo).toContain('white');
  });
});
