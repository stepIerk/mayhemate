import { describe, it, expect, afterEach } from 'vitest';
import { Game } from './Game.js';
import {
  applyEffect,
  cellInZone,
  selectTargets,
  validateRequires,
} from './effects.js';
import { setCardCatalog } from './deck.js';
import { playCardAction } from './actions.js';

const FIREBALL = {
  id: 'fireball',
  name: 'Огненный шар',
  cost: 3,
  copies: 1,
  requires: { cell: 'any' },
  effects: [
    {
      op: 'damage',
      amount: 2,
      area: 'cell',
      filter: { owner: 'any' },
    },
    {
      op: 'damage',
      amount: 1,
      area: 'adjacent8',
      filter: { owner: 'any' },
    },
  ],
};

const EXECUTE = {
  id: 'execute',
  name: 'Казнь',
  cost: 4,
  copies: 1,
  requires: {
    cell: 'piece',
    owner: 'enemy',
    hpMax: 3,
    notTypes: ['king'],
  },
  effects: [{ op: 'kill' }],
};

const RESURRECT = {
  id: 'resurrect',
  name: 'Воскрешение',
  cost: 3,
  copies: 1,
  requires: {
    cell: 'empty',
    zone: 'own_half',
    graveyard: 'own',
    notTypes: ['king'],
  },
  effects: [{ op: 'kill' }],
};

afterEach(() => {
  setCardCatalog(null);
});

function bareGame() {
  const game = new Game();
  game.pieces = [];
  game.eventBuffer = [];
  return game;
}

function ctx(game, col = 0, row = 0, caster = 'white') {
  return { state: game, caster, col, row };
}

describe('validateRequires', () => {
  it('defaults to any cell when requires is missing', () => {
    const game = bareGame();

    expect(validateRequires(game, null, 'white', 3, 3)).toBe(true);
  });

  it('checks cell piece/empty and owner', () => {
    const game = bareGame();
    const pawn = game.addPiece('pawn', 2, 2, 'black');

    expect(
      validateRequires(
        game,
        { cell: 'piece', owner: 'enemy' },
        'white',
        2,
        2
      )
    ).toBe(true);
    expect(
      validateRequires(
        game,
        { cell: 'piece', owner: 'ally' },
        'white',
        2,
        2
      )
    ).toBe(false);
    expect(
      validateRequires(game, { cell: 'empty' }, 'white', 2, 2)
    ).toBe(false);
    expect(
      validateRequires(game, { cell: 'empty' }, 'white', 3, 3)
    ).toBe(true);
    expect(pawn.color).toBe('black');
  });

  it('checks types, hp bounds and acted', () => {
    const game = bareGame();
    const pawn = game.addPiece('pawn', 2, 2, 'black');
    pawn.hp = 2;

    expect(
      validateRequires(
        game,
        { cell: 'piece', types: ['knight'] },
        'white',
        2,
        2
      )
    ).toBe(false);
    expect(
      validateRequires(
        game,
        { cell: 'piece', notTypes: ['pawn'] },
        'white',
        2,
        2
      )
    ).toBe(false);
    expect(
      validateRequires(
        game,
        { cell: 'piece', hpMax: 1 },
        'white',
        2,
        2
      )
    ).toBe(false);
    expect(
      validateRequires(
        game,
        { cell: 'piece', hpMax: 3 },
        'white',
        2,
        2
      )
    ).toBe(true);
    expect(
      validateRequires(
        game,
        { cell: 'piece', acted: true },
        'white',
        2,
        2
      )
    ).toBe(false);

    game.turnMove.push(pawn.id);

    expect(
      validateRequires(
        game,
        { cell: 'piece', acted: true },
        'white',
        2,
        2
      )
    ).toBe(true);
  });

  it('checks zone per color', () => {
    const game = bareGame();

    expect(cellInZone('white', 0, 7, 'own_home2')).toBe(true);
    expect(cellInZone('white', 0, 5, 'own_home2')).toBe(false);
    expect(cellInZone('black', 0, 0, 'own_home2')).toBe(true);
    expect(cellInZone('black', 0, 2, 'own_home2')).toBe(false);
    expect(cellInZone('white', 0, 2, 'enemy_half')).toBe(true);
    expect(cellInZone('black', 0, 5, 'enemy_half')).toBe(true);

    expect(
      validateRequires(
        game,
        { cell: 'empty', zone: 'own_half' },
        'white',
        0,
        5
      )
    ).toBe(true);
    expect(
      validateRequires(
        game,
        { cell: 'empty', zone: 'own_half' },
        'white',
        0,
        2
      )
    ).toBe(false);
  });

  it('checks graveyard contents', () => {
    const game = bareGame();

    expect(
      validateRequires(
        game,
        { cell: 'empty', graveyard: 'own', notTypes: ['king'] },
        'white',
        0,
        5
      )
    ).toBe(false);

    game.graveyard.white.push({ type: 'pawn', color: 'white', id: 90 });

    expect(
      validateRequires(
        game,
        { cell: 'empty', graveyard: 'own', notTypes: ['king'] },
        'white',
        0,
        5
      )
    ).toBe(true);
    expect(
      validateRequires(
        game,
        { cell: 'empty', graveyard: 'own', notTypes: ['pawn'] },
        'white',
        0,
        5
      )
    ).toBe(false);

    game.graveyard.black.push({ type: 'rook', color: 'black', id: 91 });

    expect(
      validateRequires(
        game,
        { cell: 'empty', graveyard: 'enemy' },
        'white',
        0,
        5
      )
    ).toBe(true);
  });

  it('rejects occupied cells when a trap is present (noTrap)', () => {
    const game = bareGame();
    game.traps.push({
      id: 't1',
      col: 3,
      row: 3,
      owner: 'black',
      kind: 'mine',
      params: {},
      revealedTo: [],
    });

    expect(
      validateRequires(game, { cell: 'any', noTrap: true }, 'white', 3, 3)
    ).toBe(false);
    expect(
      validateRequires(game, { cell: 'any', noTrap: true }, 'white', 4, 3)
    ).toBe(true);
  });
});

describe('selectTargets', () => {
  function boardWithCross(game) {
    game.addPiece('pawn', 4, 4, 'white');
    game.addPiece('pawn', 3, 4, 'black');
    game.addPiece('pawn', 5, 4, 'white');
    game.addPiece('pawn', 4, 3, 'black');
    game.addPiece('pawn', 4, 5, 'white');
    game.addPiece('pawn', 3, 3, 'white');
  }

  it('selects only the center cell by default', () => {
    const game = bareGame();
    boardWithCross(game);

    const targets = selectTargets(game, { op: 'damage' }, 'white', 4, 4);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ col: 4, row: 4 });
  });

  it('selects adjacent8 without the center and sorts deterministically', () => {
    const game = bareGame();
    boardWithCross(game);

    const targets = selectTargets(
      game,
      { op: 'damage', area: 'adjacent8', filter: { owner: 'any' } },
      'white',
      4,
      4
    );

    expect(targets.map((piece) => `${piece.col},${piece.row}`)).toEqual([
      '3,3',
      '4,3',
      '3,4',
      '5,4',
      '4,5',
    ]);
  });

  it('applies owner and type filters', () => {
    const game = bareGame();
    boardWithCross(game);

    const enemies = selectTargets(
      game,
      { op: 'damage', area: 'square3', filter: { owner: 'enemy' } },
      'white',
      4,
      4
    );

    expect(enemies.every((piece) => piece.color === 'black')).toBe(true);
    expect(enemies).toHaveLength(2);

    const typed = selectTargets(
      game,
      { op: 'damage', area: 'board', filter: { types: ['knight'] } },
      'white',
      4,
      4
    );

    expect(typed).toHaveLength(0);
  });
});

describe('card effects resolution', () => {
  it('damages center and neighbors (fireball)', () => {
    setCardCatalog({ cards: [FIREBALL] });
    const game = new Game();
    game.pieces = [];
    const center = game.addPiece('rook', 4, 4, 'black');
    const nearEnemy = game.addPiece('pawn', 3, 4, 'black');
    const nearAlly = game.addPiece('pawn', 5, 4, 'white');
    const far = game.addPiece('pawn', 0, 0, 'white');
    game.setTempo('white', 5);

    const card = game.cards.hands.white[0];
    const result = game.applyAction(playCardAction(card.uid, 4, 4));

    expect(result.ok).toBe(true);
    expect(center.hp).toBe(center.maxHp - 2);
    expect(nearEnemy.hp).toBe(nearEnemy.maxHp - 1);
    expect(nearAlly.hp).toBe(nearAlly.maxHp - 1);
    expect(far.hp).toBe(far.maxHp);
    expect(game.getTempo('white')).toBe(5 - FIREBALL.cost);
  });

  it('returns invalid-target without spending tempo when requires fail', () => {
    setCardCatalog({ cards: [EXECUTE] });
    const game = new Game();
    game.setTempo('white', 5);
    const king = game.pieces.find(
      (piece) => piece.type === 'king' && piece.color === 'black'
    );
    const hpBefore = game.getTempo('white');
    const card = game.cards.hands.white[0];

    const result = game.applyAction(playCardAction(card.uid, king.col, king.row));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-target');
    expect(game.hasCard('white', card.uid)).toBe(true);
    expect(game.getTempo('white')).toBe(hpBefore);
    expect(game.pieces).toContain(king);
  });

  it('rejects resurrect-like requirements when the graveyard is empty', () => {
    setCardCatalog({ cards: [RESURRECT] });
    const game = new Game();
    game.setTempo('white', 5);
    game.pieces = [];
    const pawn = game.addPiece('pawn', 4, 4, 'white');
    const tempoBefore = game.getTempo('white');
    const card = game.cards.hands.white[0];

    const result = game.applyAction(playCardAction(card.uid, 4, 5));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-target');
    expect(game.getTempo('white')).toBe(tempoBefore);
    expect(game.hasCard('white', card.uid)).toBe(true);
    expect(pawn.color).toBe('white');
  });

  it('runs then only when the operation affected a target', () => {
    const card = {
      id: 'test_then',
      name: 'Тест',
      cost: 0,
      copies: 1,
      requires: { cell: 'piece', owner: 'ally' },
      effects: [
        { op: 'kill', then: [{ op: 'tempo', amount: 5, who: 'self' }] },
      ],
    };

    setCardCatalog({ cards: [card] });

    const game = new Game();
    const pawn = game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'white'
    );
    const target = { col: pawn.col, row: pawn.row };

    const ok = game.applyAction(playCardAction(game.cards.hands.white[0].uid, target.col, target.row));
    expect(ok.ok).toBe(true);
    expect(game.getTempo('white')).toBe(1 + 5);
    expect(game.getPieceById(pawn.id)).toBe(undefined);
  });

  it('ignores missing then when no target matched', () => {
    const card = {
      id: 'test_then_empty',
      name: 'Тест2',
      cost: 0,
      copies: 1,
      requires: { cell: 'piece', owner: 'ally' },
      effects: [
        { op: 'kill', then: [{ op: 'tempo', amount: 5, who: 'self' }] },
      ],
    };

    setCardCatalog({ cards: [card] });

    const game = new Game();
    const tempoBefore = game.getTempo('white');

    const result = game.applyAction(
      playCardAction(game.cards.hands.white[0].uid, 0, 3)
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-target');
    expect(game.getTempo('white')).toBe(tempoBefore);
  });

  it('warns and skips unknown ops without failing the card', () => {
    const card = {
      id: 'test_unknown',
      name: 'Тест3',
      cost: 0,
      copies: 1,
      effects: [{ op: 'no_such_op' }],
    };

    setCardCatalog({ cards: [card] });

    const game = new Game();
    const result = game.applyAction(
      playCardAction(game.cards.hands.white[0].uid, 0, 0)
    );

    expect(result.ok).toBe(true);
  });

  it('applies statuses through set_status', () => {
    const game = bareGame();
    const pawn = game.addPiece('pawn', 2, 2, 'black');

    const touched = applyEffect(
      game,
      { op: 'set_status', status: 'shield', charges: 1 },
      ctx(game, 2, 2)
    );

    expect(touched).toBe(true);
    expect(pawn.status.shield).toEqual({ charges: 1 });

    applyEffect(
      game,
      { op: 'set_status', status: 'shield', charges: 1 },
      ctx(game, 2, 2)
    );

    expect(pawn.status.shield.charges).toBe(2);
  });
});
