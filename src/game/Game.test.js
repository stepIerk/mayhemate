import { describe, it, expect } from 'vitest';
import { Game } from './Game.js';

describe('Game', () => {
  it('creates 32 initial pieces', () => {
    const game = new Game();
    expect(game.pieces).toHaveLength(32);
    expect(game.turn).toBe('white');
  });

  it('moves a white pawn forward', () => {
    const game = new Game();
    const pawn = game.pieces.find((piece) => piece.type === 'pawn' && piece.color === 'white');
    const result = game.applyAction({
      type: 'MOVE',
      pieceId: pawn.id,
      col: pawn.col,
      row: pawn.row - 1,
    });

    expect(result.ok).toBe(true);
    expect(result.result).toBe('move');
    expect(game.getPieceById(pawn.id).row).toBe(5);
  });

  it('attacks and damages an enemy piece', () => {
    const game = new Game();
    const whitePawn = game.pieces.find((piece) => piece.type === 'pawn' && piece.color === 'white' && piece.col === 0);
    const blackPawn = game.pieces.find((piece) => piece.type === 'pawn' && piece.color === 'black' && piece.col === 1);

    // Move white pawn to attack position is not needed for damage test; directly attack adjacent black pawn.
    whitePawn.col = blackPawn.col - 1;
    whitePawn.row = blackPawn.row + 1;

    const beforeHp = blackPawn.hp;
    const result = game.applyAction({
      type: 'MOVE',
      pieceId: whitePawn.id,
      col: blackPawn.col,
      row: blackPawn.row,
    });

    expect(result.ok).toBe(true);
    expect(result.result).toBe('attack');
    expect(blackPawn.hp).toBe(beforeHp - whitePawn.atk);
  });

  it('serializes and restores state', () => {
    const game = new Game();
    const pawn = game.pieces.find((piece) => piece.type === 'pawn' && piece.color === 'white');
    game.applyAction({ type: 'MOVE', pieceId: pawn.id, col: pawn.col, row: pawn.row - 1 });
    game.applyAction({ type: 'END_TURN' });

    const restored = Game.fromState(game.toState());
    expect(restored.turn).toBe(game.turn);
    expect(restored.nextId).toBe(game.nextId);
    expect(restored.pieces).toHaveLength(game.pieces.length);
    expect(restored.getPieceById(pawn.id).row).toBe(5);
  });

  it('allows only one move per turn but multiple attacks while tempo remains', () => {
    const game = new Game();
    game.maxTempo = 3;
    game.setTempo('white', 3);

    const pawns = game.pieces.filter((piece) => piece.type === 'pawn' && piece.color === 'white');
    const first = pawns[0];
    const second = pawns[1];

    const firstMove = game.applyAction({
      type: 'MOVE',
      pieceId: first.id,
      col: first.col,
      row: first.row - 1,
    });
    expect(firstMove.ok).toBe(true);
    expect(firstMove.result).toBe('move');

    const secondMove = game.applyAction({
      type: 'MOVE',
      pieceId: second.id,
      col: second.col,
      row: second.row - 1,
    });
    expect(secondMove.ok).toBe(false);
    expect(secondMove.reason).toBe('already-moved');
  });
  it('rejects moves for the wrong color', () => {
    const game = new Game();
    const blackPawn = game.pieces.find((piece) => piece.type === 'pawn' && piece.color === 'black');
    const result = game.applyAction({
      type: 'MOVE',
      pieceId: blackPawn.id,
      col: blackPawn.col,
      row: blackPawn.row + 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-your-turn');
  });
});

describe('Game attacks', () => {
  function placeDuel({ attackerType = 'pawn', targetStatus = null } = {}) {
    const game = new Game();
    game.pieces = [];
    const attacker = game.addPiece(attackerType, 3, 4, 'white');
    const target = game.addPiece('pawn', 4, 3, 'black');

    if (targetStatus) {
      target.status = { ...targetStatus };
    }

    return { game, attacker, target };
  }

  it('uses effective attack including tempAtk', () => {
    const { game, attacker, target } = placeDuel();
    attacker.tempAtk = 2;
    const hpBefore = target.hp;

    const result = game.applyAction({
      type: 'MOVE',
      pieceId: attacker.id,
      col: target.col,
      row: target.row,
    });

    expect(result.ok).toBe(true);
    expect(target.hp).toBe(hpBefore - attacker.effAtk);
    expect(result.events.find((event) => event.type === 'attack')).toMatchObject(
      { damage: attacker.effAtk }
    );
  });

  it('absorbs an attack with shield and keeps the target alive', () => {
    const { game, attacker, target } = placeDuel({
      targetStatus: { shield: { charges: 1 } },
    });
    const hpBefore = target.hp;

    const result = game.applyAction({
      type: 'MOVE',
      pieceId: attacker.id,
      col: target.col,
      row: target.row,
    });

    expect(result.result).toBe('attack');
    expect(target.hp).toBe(hpBefore);
    expect(target.status.shield).toBeUndefined();
    expect(result.events.some((event) => event.type === 'shield')).toBe(true);
    expect(game.pieces).toContain(attacker);
    expect(attacker.col).toBe(3);
  });

  it('returns thorns damage to the attacker', () => {
    const { game, attacker, target } = placeDuel({
      targetStatus: { thorns: { damage: 1 } },
    });
    const attackerHpBefore = attacker.hp;

    const result = game.applyAction({
      type: 'MOVE',
      pieceId: attacker.id,
      col: target.col,
      row: target.row,
    });

    expect(result.ok).toBe(true);
    expect(attacker.hp).toBe(attackerHpBefore - 1);
  });

  it('kills the attacker with thorns before it occupies the cell', () => {
    const { game, attacker, target } = placeDuel({
      attackerType: 'king',
      targetStatus: { thorns: { damage: 10 } },
    });

    const result = game.applyAction({
      type: 'MOVE',
      pieceId: attacker.id,
      col: target.col,
      row: target.row,
    });

    expect(result.result).toBe('kill');
    expect(game.getPieceById(attacker.id)).toBe(undefined);
    expect(game.pieces).toContain(target);
    expect(target.col).toBe(4);
    expect(target.row).toBe(3);
    expect(game.gameOver).toEqual({ loser: 'white', winner: 'black' });
  });

  it('blocks movement of a frozen piece', () => {
    const game = new Game();
    const pawn = game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'white'
    );
    pawn.status.frozen = { turns: 1 };

    const result = game.applyAction({
      type: 'MOVE',
      pieceId: pawn.id,
      col: pawn.col,
      row: pawn.row - 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('frozen');
    expect(game.getLegalMoves(pawn)).toEqual([]);
  });

  it('ends the game when an attack removes a king', () => {
    const game = new Game();
    game.pieces = [];
    const attacker = game.addPiece('queen', 4, 4, 'white');
    const king = game.addPiece('king', 4, 3, 'black');
    king.hp = 2;

    const result = game.applyAction({
      type: 'MOVE',
      pieceId: attacker.id,
      col: king.col,
      row: king.row,
    });

    expect(result.result).toBe('kill');
    expect(game.gameOver).toEqual({ loser: 'black', winner: 'white' });
    expect(result.events.some((event) => event.type === 'game_over')).toBe(
      true
    );
    expect(attacker.row).toBe(3);
  });
});