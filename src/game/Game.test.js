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