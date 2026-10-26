import { Piece } from './Piece.js';

const BOARD_SIZE = 8;

const PAWN_DIRECTION = {
  white: -1,
  black: 1,
};

const PAWN_START_ROW = {
  white: 6,
  black: 1,
};

const BACK_RANK = [
  'rook',
  'knight',
  'bishop',
  'queen',
  'king',
  'bishop',
  'knight',
  'rook',
];

export class Game {
  constructor() {
    this.pieces = [];
    this.turn = 'white';
    this.nextId = 1;
    this.createInitialPieces();
  }

  addPiece(type, col, row, color) {
    const piece = new Piece(this.nextId++, type, col, row, color);
    this.pieces.push(piece);
    return piece;
  }

  removePiece(piece) {
    const index = this.pieces.indexOf(piece);
    if (index !== -1) {
      this.pieces.splice(index, 1);
    }
  }

  getPieceAt(col, row) {
    return this.pieces.find((piece) => piece.col === col && piece.row === row);
  }

  getPieceById(id) {
    return this.pieces.find((piece) => piece.id === id);
  }

  movePiece(piece, newCol, newRow) {
    piece.col = newCol;
    piece.row = newRow;
  }

  applyAction(action) {
    switch (action?.type) {
      case 'move':
        return this.applyMove(action);
      case 'endTurn':
        return this.applyEndTurn();
      default:
        return { ok: false, reason: 'unknown-action' };
    }
  }

  applyMove({ pieceId, col, row }) {
    const piece = this.getPieceById(pieceId);

    if (!piece) {
      return { ok: false, reason: 'piece-not-found' };
    }

    if (!this.canAct(piece)) {
      return { ok: false, reason: 'not-your-turn' };
    }

    if (!this.isLegalMove(piece, col, row)) {
      return { ok: false, reason: 'illegal-move' };
    }

    const from = { col: piece.col, row: piece.row };
    const target = this.getPieceAt(col, row);
    const events = [];

    if (target) {
      target.damage(piece.atk);
      events.push({
        type: 'attack',
        attackerId: piece.id,
        targetId: target.id,
        damage: piece.atk,
        hp: target.hp,
        col: target.col,
        row: target.row,
        color: target.color,
      });

      if (target.hp <= 0) {
        this.removePiece(target);
        this.movePiece(piece, col, row);
        events.push({
          type: 'kill',
          pieceId: target.id,
          byId: piece.id,
          col,
          row,
          color: target.color,
        });
        events.push({
          type: 'move',
          pieceId: piece.id,
          from,
          to: { col, row },
        });
        return { ok: true, result: 'kill', events };
      }

      return { ok: true, result: 'attack', events };
    }

    this.movePiece(piece, col, row);
    events.push({
      type: 'move',
      pieceId: piece.id,
      from,
      to: { col, row },
    });
    return { ok: true, result: 'move', events };
  }

  applyEndTurn() {
    this.endTurn();
    return {
      ok: true,
      result: 'endTurn',
      events: [{ type: 'turn', turn: this.turn }],
    };
  }

  isLegalMove(piece, newCol, newRow) {
    if (!this.isInsideBoard(newCol, newRow)) {
      return false;
    }

    if (piece.col === newCol && piece.row === newRow) {
      return false;
    }

    const targetPiece = this.getPieceAt(newCol, newRow);

    if (targetPiece?.color === piece.color) {
      return false;
    }

    const colDiff = Math.abs(newCol - piece.col);
    const rowDiff = Math.abs(newRow - piece.row);

    switch (piece.type) {
      case 'pawn': {
        const direction = PAWN_DIRECTION[piece.color];
        const nextRow = piece.row + direction;

        if (newCol === piece.col) {
          if (targetPiece) {
            return false;
          }

          if (newRow === nextRow) {
            return true;
          }

          return (
            piece.row === PAWN_START_ROW[piece.color] &&
            newRow === piece.row + direction * 2 &&
            !this.getPieceAt(piece.col, nextRow)
          );
        }

        return newRow === nextRow && colDiff === 1 && Boolean(targetPiece);
      }
      case 'rook':
        return (
          (colDiff === 0 || rowDiff === 0) &&
          this.isPathClear(piece, newCol, newRow)
        );
      case 'knight':
        return (
          (colDiff === 2 && rowDiff === 1) ||
          (colDiff === 1 && rowDiff === 2)
        );
      case 'bishop':
        return colDiff === rowDiff && this.isPathClear(piece, newCol, newRow);
      case 'queen':
        return (
          (colDiff === rowDiff || colDiff === 0 || rowDiff === 0) &&
          this.isPathClear(piece, newCol, newRow)
        );
      case 'king':
        return colDiff <= 1 && rowDiff <= 1;
      default:
        return false;
    }
  }

  isPathClear(piece, newCol, newRow) {
    const stepCol = Math.sign(newCol - piece.col);
    const stepRow = Math.sign(newRow - piece.row);
    let col = piece.col + stepCol;
    let row = piece.row + stepRow;

    while (col !== newCol || row !== newRow) {
      if (this.getPieceAt(col, row)) {
        return false;
      }

      col += stepCol;
      row += stepRow;
    }

    return true;
  }

  isInsideBoard(col, row) {
    return col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE;
  }

  canAct(piece) {
    return piece?.color === this.turn;
  }

  getLegalMoves(piece) {
    if (!this.canAct(piece)) {
      return [];
    }

    const moves = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!this.isLegalMove(piece, col, row)) {
          continue;
        }

        moves.push({
          col,
          row,
          type: this.getPieceAt(col, row) ? 'attack' : 'move',
        });
      }
    }

    return moves;
  }

  createInitialPieces() {
    for (let col = 0; col < BOARD_SIZE; col++) {
      this.addPiece(BACK_RANK[col], col, 7, 'white');
      this.addPiece('pawn', col, 6, 'white');
      this.addPiece(BACK_RANK[col], col, 0, 'black');
      this.addPiece('pawn', col, 1, 'black');
    }
  }

  getState() {
    return {
      turn: this.turn,
      nextId: this.nextId,
      pieces: this.pieces.map((piece) => ({
        id: piece.id,
        type: piece.type,
        col: piece.col,
        row: piece.row,
        hp: piece.hp,
        atk: piece.atk,
        color: piece.color,
      })),
    };
  }

  getTurnColor() {
    return this.turn;
  }

  endTurn() {
    this.turn = this.turn === 'white' ? 'black' : 'white';
  }
}
