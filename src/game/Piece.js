import { PIECE_TYPES } from './pieces.js';

export class Piece {
  constructor(id, type, col, row, color) {
    if (!PIECE_TYPES[type]) {
      throw new Error(`Invalid piece type: ${type}`);
    }
    this.type = type;
    this.id = id;
    this.col = col;
    this.row = row;
    this.hp = PIECE_TYPES[type].hp;
    this.atk = PIECE_TYPES[type].atk;
    this.color = color;
    this.maxHp = PIECE_TYPES[type].hp;
    this.tempAtk = 0;
    this.status = {};
  }

  get effAtk() {
    return Math.max(0, this.atk + this.tempAtk);
  }

  addHp(amount) {
    this.hp += amount;
  }

  damage(amount) {
    this.hp -= amount;
  }

  addAtk(amount) {
    this.atk += amount;
  }

  toState() {
    return {
      id: this.id,
      type: this.type,
      col: this.col,
      row: this.row,
      hp: this.hp,
      atk: this.atk,
      color: this.color,
      maxHp: this.maxHp,
      tempAtk: this.tempAtk,
      status: cloneStatus(this.status),
    };
  }

  static fromState(state) {
    const piece = new Piece(
      state.id,
      state.type,
      state.col,
      state.row,
      state.color
    );
    piece.hp = state.hp;
    piece.atk = state.atk;
    piece.maxHp =
      typeof state.maxHp === 'number' ? state.maxHp : state.hp;
    piece.tempAtk = typeof state.tempAtk === 'number' ? state.tempAtk : 0;
    piece.status = cloneStatus(state.status);
    return piece;
  }
}

export function cloneStatus(status = {}) {
  const result = {};

  for (const [key, value] of Object.entries(status ?? {})) {
    if (value && typeof value === 'object') {
      result[key] = { ...value };
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
