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

}