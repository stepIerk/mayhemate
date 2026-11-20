import { describe, it, expect, afterEach } from 'vitest';
import { Game } from './Game.js';
import { Piece } from './Piece.js';
import { dealDamage, healPiece, removePiece } from './damage.js';
import { normalizeCardCatalog, setCardCatalog } from './deck.js';

afterEach(() => {
  setCardCatalog(null);
});

function createGame() {
  return new Game();
}

function clearBoard(game) {
  game.pieces = [];
}

describe('piece model', () => {
  it('initializes maxHp, tempAtk and status', () => {
    const piece = new Piece(1, 'pawn', 0, 6, 'white');

    expect(piece.maxHp).toBe(2);
    expect(piece.tempAtk).toBe(0);
    expect(piece.status).toEqual({});
    expect(piece.effAtk).toBe(1);
  });

  it('computes effective attack from tempAtk and never below zero', () => {
    const piece = new Piece(1, 'pawn', 0, 6, 'white');
    piece.tempAtk = 2;

    expect(piece.effAtk).toBe(3);

    piece.atk = 1;
    piece.tempAtk = -5;

    expect(piece.effAtk).toBe(0);
  });

  it('restores legacy piece states without new fields', () => {
    const piece = Piece.fromState({
      id: 3,
      type: 'rook',
      col: 0,
      row: 7,
      hp: 2,
      atk: 2,
      color: 'white',
    });

    expect(piece.maxHp).toBe(2);
    expect(piece.tempAtk).toBe(0);
    expect(piece.status).toEqual({});
  });
});

describe('game state serialization', () => {
  it('round-trips new fields', () => {
    const game = createGame();
    game.graveyard.white.push({ type: 'pawn', color: 'white', id: 40 });
    game.traps.push({
      id: 't1',
      col: 3,
      row: 3,
      owner: 'white',
      kind: 'mine',
      params: { damage: 3 },
      revealedTo: ['white'],
    });
    game.tempoMod.black = -1;
    game.rngState = 12345;
    game.nextPieceId = 7;
    const pawn = game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'white'
    );
    pawn.maxHp = 4;
    pawn.tempAtk = 2;
    pawn.status = { frozen: { turns: 2 }, shield: { charges: 1 } };

    const restored = Game.fromState(game.toState());

    expect(restored.graveyard).toEqual(game.graveyard);
    expect(restored.traps).toEqual(game.traps);
    expect(restored.tempoMod).toEqual(game.tempoMod);
    expect(restored.rngState).toBe(12345);
    expect(restored.nextPieceId).toBe(7);
    expect(restored.toState()).toEqual(game.toState());

    const restoredPawn = restored.getPieceById(pawn.id);
    expect(restoredPawn.maxHp).toBe(4);
    expect(restoredPawn.tempAtk).toBe(2);
    expect(restoredPawn.status).toEqual({
      frozen: { turns: 2 },
      shield: { charges: 1 },
    });
    expect(restoredPawn.effAtk).toBe(restoredPawn.atk + 2);
  });

  it('applies defaults when loading a legacy state', () => {
    const game = createGame();
    const legacy = {
      version: 1,
      turn: 'black',
      nextId: 33,
      pieces: [
        { id: 1, type: 'king', col: 4, row: 7, hp: 5, atk: 1, color: 'white' },
      ],
      turnMove: [],
      movedThisTurn: false,
      heroes: { white: { tempo: 2 }, black: { tempo: 1 } },
      turnCount: 3,
      maxTempo: 2,
      cards: game.cards.toState(),
    };

    const restored = Game.fromState(legacy);

    expect(restored.graveyard).toEqual({ white: [], black: [] });
    expect(restored.traps).toEqual([]);
    expect(restored.tempoMod).toEqual({ white: 0, black: 0 });
    expect(restored.gameOver).toBe(null);
    expect(restored.pieces[0].maxHp).toBe(5);
    expect(restored.pieces[0].status).toEqual({});
  });

  it('copies status objects instead of sharing references', () => {
    const game = createGame();
    const pawn = game.pieces[0];
    pawn.status = { poison: { turns: 2, damage: 1 } };

    const state = game.toState();
    state.pieces[0].status.poison.turns = 99;

    expect(game.pieces[0].status.poison.turns).toBe(2);
  });
});

describe('card catalog requires', () => {
  it('keeps requires through normalization', () => {
    const catalog = normalizeCardCatalog({
      cards: [
        {
          id: 'execute',
          name: 'Казнь',
          cost: 4,
          requires: { cell: 'piece', owner: 'enemy', hpMax: 3 },
          effects: [{ op: 'kill' }],
        },
        { id: 'no-requires', name: 'Просто' },
      ],
    });

    expect(catalog.cards[0].requires).toEqual({
      cell: 'piece',
      owner: 'enemy',
      hpMax: 3,
    });
    expect(catalog.cards[1].requires).toBe(null);
  });
});

describe('dealDamage', () => {
  it('absorbs damage with shield and removes the status at zero charges', () => {
    const game = createGame();
    clearBoard(game);
    const target = game.addPiece('pawn', 3, 3, 'black');
    target.status.shield = { charges: 1 };

    const result = dealDamage(game, target, 2, {});

    expect(result).toMatchObject({ dealt: 0, blocked: true });
    expect(target.hp).toBe(target.maxHp);
    expect(target.status.shield).toBeUndefined();
  });

  it('lets pierce ignore the shield', () => {
    const game = createGame();
    clearBoard(game);
    const target = game.addPiece('pawn', 3, 3, 'black');
    target.status.shield = { charges: 2 };
    const hpBefore = target.hp;

    dealDamage(game, target, 1, { pierce: true });

    expect(target.hp).toBe(hpBefore - 1);
    expect(target.status.shield.charges).toBe(2);
  });

  it('emits damage and kill events and fills the graveyard', () => {
    const game = createGame();
    clearBoard(game);
    const target = game.addPiece('pawn', 3, 3, 'black');
    game.eventBuffer = [];

    const result = dealDamage(game, target, 5, {});

    expect(result.died).toBe(true);
    expect(game.pieces).toHaveLength(0);
    expect(game.graveyard.black).toEqual([
      { type: 'pawn', color: 'black', id: target.id },
    ]);
    expect(game.eventBuffer.map((event) => event.type)).toEqual([
      'damage',
      'kill',
    ]);
  });

  it('does not add exiled pieces to the graveyard', () => {
    const game = createGame();
    clearBoard(game);
    const target = game.addPiece('pawn', 3, 3, 'black');

    removePiece(game, target, { exile: true });

    expect(game.graveyard.black).toHaveLength(0);
  });

  it('heals lifelink attacker for the damage dealt', () => {
    const game = createGame();
    clearBoard(game);
    const attacker = game.addPiece('knight', 2, 2, 'white');
    const target = game.addPiece('pawn', 3, 3, 'black');
    attacker.hp = 1;
    attacker.status.lifelink = true;

    dealDamage(game, target, 2, { attacker });

    expect(attacker.hp).toBe(3);
  });

  it('does not heal lifelink attacker when the shield blocked damage', () => {
    const game = createGame();
    clearBoard(game);
    const attacker = game.addPiece('knight', 2, 2, 'white');
    const target = game.addPiece('pawn', 3, 3, 'black');
    attacker.hp = 1;
    attacker.status.lifelink = true;
    target.status.shield = { charges: 1 };

    dealDamage(game, target, 2, { attacker });

    expect(attacker.hp).toBe(1);
  });

  it('returns without changes for non-positive damage', () => {
    const game = createGame();
    clearBoard(game);
    const target = game.addPiece('pawn', 3, 3, 'black');
    game.eventBuffer = [];

    const result = dealDamage(game, target, 0, {});

    expect(result).toMatchObject({ dealt: 0 });
    expect(target.hp).toBe(target.maxHp);
    expect(game.eventBuffer).toHaveLength(0);
  });
});

describe('healPiece', () => {
  it('never heals above maxHp', () => {
    const game = createGame();
    clearBoard(game);
    const piece = game.addPiece('pawn', 0, 0, 'white');
    piece.hp = 1;
    game.eventBuffer = [];

    const healed = healPiece(game, piece, 5);

    expect(healed).toBe(1);
    expect(piece.hp).toBe(piece.maxHp);
  });
});

describe('game over', () => {
  it('ends the game when a king is removed', () => {
    const game = createGame();
    clearBoard(game);
    const king = game.addPiece('king', 4, 4, 'black');
    game.eventBuffer = [];

    dealDamage(game, king, 10, {});

    expect(game.gameOver).toEqual({ loser: 'black', winner: 'white' });
    expect(game.eventBuffer.at(-1)).toMatchObject({
      type: 'game_over',
      loser: 'black',
      winner: 'white',
    });
  });

  it('does not fire twice', () => {
    const game = createGame();
    clearBoard(game);
    const king = game.addPiece('king', 4, 4, 'black');
    game.eventBuffer = [];

    dealDamage(game, king, 10, {});
    const events = game.takeEvents();

    expect(
      events.filter((event) => event.type === 'game_over')
    ).toHaveLength(1);
    expect(game.gameOver.winner).toBe('white');
  });
});
