import { Piece } from './Piece.js';
import { CardState, findCardDefinition, getCardCatalog } from './deck.js';
import { dealDamage, removePiece } from './damage.js';
import { applyEffects, areaCells, validateRequires } from './effects.js';
import { nextRandom } from './rng.js';
import { checkTraps } from './traps.js';
const BOARD_SIZE = 8;

const MAX_MAX_TEMPO = 5;


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

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

function cloneGraveyard(graveyard) {
  return {
    white: Array.isArray(graveyard?.white)
      ? graveyard.white.map((entry) => ({ ...entry }))
      : [],
    black: Array.isArray(graveyard?.black)
      ? graveyard.black.map((entry) => ({ ...entry }))
      : [],
  };
}

function redactCards(cardState, viewerColor) {
  const opponent = viewerColor === 'white' ? 'black' : 'white';
  const result = {
    seed: cardState.seed,
    deck: cardState.deck.map((c) => ({ ...c })),
    hands: {
      white: viewerColor === 'white' ? cardState.hands.white.map((c) => ({ ...c })) : [],
      black: viewerColor === 'black' ? cardState.hands.black.map((c) => ({ ...c })) : [],
    },
    discard: cardState.discard.map((c) => ({ ...c })),
  };
  // keep own hand; opponent already empty
  if (viewerColor === 'white') {
    result.hands.black = [];
  } else {
    result.hands.white = [];
  }
  // ensure opponent hand hidden
  result.hands[opponent] = [];
  return result;
}

export class Game {
  constructor() {
    this.version = 1;
    this.pieces = [];
    this.turn = 'white';
    this.nextId = 1;
    this.createInitialPieces();
    this.cards = CardState.create(getCardCatalog().cards);

    this.turnMove = [];
    this.movedThisTurn = false;
    this.turnCount = 1;

    this.maxTempo = 1;

    this.heroes = {
        'white': {
            tempo: this.maxTempo,
        },
        'black': {
            tempo: this.maxTempo,
        }

    }

    this.graveyard = { white: [], black: [] };
    this.traps = [];
    this.tempoMod = { white: 0, black: 0 };
    this.tempoModMin = { white: 1, black: 1 };
    this.rngState = Math.floor(Math.random() * 0xffffffff) >>> 0;
    this.nextPieceId = 1;
    this.nextTrapId = 1;
    this.gameOver = null;
  }


  addPiece(type, col, row, color) {
    const id = this.nextId++;
    this.nextPieceId = Math.max(this.nextPieceId, id + 1);
    const piece = new Piece(id, type, col, row, color);
    this.pieces.push(piece);
    return piece;
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

  pushEvent(event) {
    if (Array.isArray(this.eventBuffer)) {
      this.eventBuffer.push(event);
    }
  }

  takeEvents() {
    const events = Array.isArray(this.eventBuffer)
      ? this.eventBuffer
      : [];
    this.eventBuffer = null;
    return events;
  }

  applyAction(action) {
    this.eventBuffer = [];

    if (this.gameOver) {
      this.eventBuffer = null;
      return { ok: false, reason: 'game-over' };
    }

    const result = this.applyActionInner(action);

    if (!result?.ok) {
      this.eventBuffer = null;
      return result;
    }

    const events = [
      ...(result.events ?? []),
      ...this.takeEvents(),
    ];
    delete result.events;

    return { ...result, events };
  }

  applyActionInner(action) {
    switch (action?.type) {
      case 'MOVE':
      case 'move':
        return this.applyMove(action);
      case 'END_TURN':
      case 'endTurn':
        return this.applyEndTurn();
      case 'PLAY_CARD':
      case 'playCard':
        return this.applyPlayCard(action);
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

    if (piece.status?.frozen) {
      return { ok: false, reason: 'frozen' };
    }

    const hero = this.heroes[piece.color]

    if (this.turnMove.includes(piece.id)) {
      return { ok: false, reason: 'already-moved' };
    }
    if (hero.tempo <= 0) {
      return { ok: false, reason: 'no-tempo' };
    }

    if (!this.isLegalMove(piece, col, row)) {
      return { ok: false, reason: 'illegal-move' };
    }

    const from = { col: piece.col, row: piece.row };
    const target = this.getPieceAt(col, row);

    if (target) {
      const attack = dealDamage(this, target, piece.effAtk, {
        attacker: piece,
      });

      this.pushEvent({
        type: 'attack',
        attackerId: piece.id,
        targetId: target.id,
        damage: attack.dealt,
        blocked: attack.blocked,
        hp: target.hp,
        col: target.col,
        row: target.row,
        color: target.color,
      });

      this.updateTempo(piece.color, -1);
      this.turnMove.push(piece.id);

      const attackerAlive = this.pieces.includes(piece);

      if (attack.died) {
        if (attackerAlive) {
          this.movePiece(piece, col, row);
          this.pushEvent({
            type: 'move',
            pieceId: piece.id,
            from,
            to: { col, row },
          });
          checkTraps(this, piece);
        }

        return { ok: true, result: 'kill' };
      }

      if (!attackerAlive) {
        return { ok: true, result: 'kill' };
      }

      return { ok: true, result: 'attack' };
    }

    if (this.movedThisTurn) {
      return { ok: false, reason: 'already-moved' };
    }

    this.movePiece(piece, col, row);
    this.pushEvent({
      type: 'move',
      pieceId: piece.id,
      from,
      to: { col, row },
    });
    checkTraps(this, piece);
    this.turnMove.push(piece.id);
    this.movedThisTurn = true;
    this.updateTempo(piece.color, -1);
    return { ok: true, result: 'move' };
  }

  applyEndTurn() {
    this.endTurn();
    this.pushEvent({ type: 'turn', turn: this.turn });
    return {
      ok: true,
      result: 'endTurn',
      events: [],
    };
  }

  applyPlayCard({ cardUid, col, row }) {
    const color = this.turn;

    if (!this.hasCard(color, cardUid)) {
      return { ok: false, reason: 'card-not-in-hand' };
    }

    if (
      !Number.isInteger(col) ||
      !Number.isInteger(row) ||
      !this.isInsideBoard(col, row)
    ) {
      return { ok: false, reason: 'invalid-target' };
    }

    const inHand = this.cards.hands[color].find(
      (card) => card.uid === cardUid
    );
    const definition = findCardDefinition(inHand?.cardId);
    const cost = definition?.cost ?? 0;
    const hero = this.heroes[color];

    if (hero.tempo < cost) {
      return { ok: false, reason: 'no-tempo' };
    }

    if (!validateRequires(this, definition?.requires, color, col, row)) {
      return { ok: false, reason: 'invalid-target' };
    }

    const card = this.cards.play(color, cardUid, { col, row });

    if (!card) {
      return { ok: false, reason: 'card-not-in-hand' };
    }

    this.updateTempo(color, -cost);

    this.pushEvent({
      type: 'card',
      cardId: card.cardId,
      cardUid: card.uid,
      color,
      col,
      row,
    });

    applyEffects(this, definition?.effects, {
      state: this,
      caster: color,
      col,
      row,
      rng: () => nextRandom(this),
    });

    return {
      ok: true,
      result: 'card',
      events: [],
    };
  }

  hasCard(color, cardUid) {
    return this.cards?.hasInHand(color, cardUid) ?? false;
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
    
    if(piece?.color !== this.turn) return false;

    return true
  }

  getLegalMoves(piece) {

    if (!this.canAct(piece)) {
      return [];
    }

    if (piece.status?.frozen) {
      return [];
    }

    if (this.turnMove.includes(piece.id)) {
      return [];
    }

    if (this.getTempo(piece.color) === 0) {
      return [];
    }


    const moves = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!this.isLegalMove(piece, col, row)) {
          continue;
        }

        const isAttack = Boolean(this.getPieceAt(col, row));
        if (!isAttack && this.movedThisTurn) {
          continue;
        }

        moves.push({
          col,
          row,
          type: isAttack ? 'attack' : 'move',
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

  toState(viewerColor = null) {
    const state = {
      version: this.version,
      turn: this.turn,
      nextId: this.nextId,
      pieces: this.pieces.map((piece) => piece.toState()),
      turnMove: [...this.turnMove],
      movedThisTurn: this.movedThisTurn,
      heroes: {
        white: { ...this.heroes.white },
        black: { ...this.heroes.black },
      },
      turnCount: this.turnCount,
      maxTempo: this.maxTempo,
      cards: viewerColor
        ? redactCards(this.cards.toState(), viewerColor)
        : this.cards.toState(),
      graveyard: cloneGraveyard(this.graveyard),
      traps: this.traps
        .filter((trap) => {
          if (!viewerColor) {
            return true;
          }
          return (
            trap.owner === viewerColor ||
            (Array.isArray(trap.revealedTo) &&
              trap.revealedTo.includes(viewerColor))
          );
        })
        .map((trap) => ({ ...trap })),
      tempoMod: { ...this.tempoMod },
      tempoModMin: { ...this.tempoModMin },
      rngState: this.rngState,
      nextPieceId: this.nextPieceId,
      nextTrapId: this.nextTrapId,
      gameOver: this.gameOver ? { ...this.gameOver } : null,
    };
    return state;
  }

  getState() {
    return this.toState();
  }

  static fromState(state) {
    const game = Object.create(Game.prototype);
    game.version = state?.version ?? 1;
    game.pieces = [];
    game.turn = state?.turn ?? 'white';
    game.nextId = state?.nextId ?? 1;

    game.turnMove = Array.isArray(state?.turnMove) ? [...state.turnMove] : [];
    game.movedThisTurn = Boolean(state?.movedThisTurn);
    game.cards = CardState.fromState(
      state?.cards,
      getCardCatalog().cards
    );

    game.turnCount = state?.turnCount ?? 1;
    game.maxTempo = state?.maxTempo ?? 1;
    game.heroes = {
      white: {
        tempo:
          typeof state?.heroes?.white?.tempo === 'number'
            ? state.heroes.white.tempo
            : game.maxTempo,
      },
      black: {
        tempo:
          typeof state?.heroes?.black?.tempo === 'number'
            ? state.heroes.black.tempo
            : game.maxTempo,
      },
    };

    game.graveyard = cloneGraveyard(state?.graveyard);
    game.traps = Array.isArray(state?.traps)
      ? state.traps.map((trap) => ({ ...trap }))
      : [];
    game.tempoMod = {
      white: numberOr(state?.tempoMod?.white, 0),
      black: numberOr(state?.tempoMod?.black, 0),
    };
    game.tempoModMin = {
      white: numberOr(state?.tempoModMin?.white, 1),
      black: numberOr(state?.tempoModMin?.black, 1),
    };
    game.rngState = numberOr(state?.rngState, 0) >>> 0;
    game.nextPieceId = numberOr(state?.nextPieceId ?? state?.nextId, 1);
    game.nextId = Math.max(game.nextId, game.nextPieceId);
    game.nextTrapId = numberOr(state?.nextTrapId, 1);
    game.gameOver = state?.gameOver ? { ...state.gameOver } : null;

    for (const pieceState of state?.pieces ?? []) {
      game.pieces.push(Piece.fromState(pieceState));
    }

    const maxNumericId = Math.max(
      0,
      ...game.pieces
        .map((piece) => piece.id)
        .filter((id) => typeof id === 'number')
    );

    if (game.nextId <= maxNumericId) {
      game.nextId = maxNumericId + 1;
    }

    return game;
  }

  getTurnColor() {
    return this.turn;
  }

  endTurn() {
    const endingColor = this.turn;

    for (const piece of this.pieces) {
      piece.tempAtk = 0;

      const frozen = piece.status?.frozen;
      if (frozen && piece.color === endingColor) {
        frozen.turns -= 1;
        if (frozen.turns <= 0) {
          delete piece.status.frozen;
          this.pushEvent({
            type: 'status',
            id: piece.id,
            status: 'frozen',
            removed: true,
            col: piece.col,
            row: piece.row,
            color: piece.color,
          });
        }
      }
    }

    this.turnMove = [];
    this.movedThisTurn = false;
    if (this.turn == 'black'){
        this.turnCount += 1
    }
    if (this.maxTempo < MAX_MAX_TEMPO){
        this.maxTempo = Math.floor(this.turnCount / 2) + 1;
    }
    
    this.turn = this.turn === 'white' ? 'black' : 'white';

    const mod = this.tempoMod[this.turn];
    const min = this.tempoModMin[this.turn] ?? 1;
    if (mod !== 0) {
      this.tempoMod[this.turn] = 0;
    }
    this.tempoModMin[this.turn] = 1;
    const nextTempo = Math.min(
      MAX_MAX_TEMPO,
      Math.max(min, this.maxTempo + mod)
    );
    this.setTempo(this.turn, nextTempo);
    this.cards.draw(this.turn, 1);

    this.tickStatuses(this.turn);
  }

  tickStatuses(color) {
    for (const piece of [...this.pieces]) {
      if (!this.pieces.includes(piece)) {
        continue;
      }
      const poison = piece.status?.poison;
      if (!poison || piece.color !== color) {
        continue;
      }

      dealDamage(this, piece, poison.damage, { pierce: true });

      if (!this.pieces.includes(piece)) {
        continue;
      }

      poison.turns -= 1;
      if (poison.turns <= 0) {
        delete piece.status.poison;
        this.pushEvent({
          type: 'status',
          id: piece.id,
          status: 'poison',
          removed: true,
          col: piece.col,
          row: piece.row,
          color: piece.color,
        });
      }
    }

    for (const piece of [...this.pieces]) {
      if (!this.pieces.includes(piece)) {
        continue;
      }
      const bomb = piece.status?.bomb;
      if (!bomb || bomb.by !== color) {
        continue;
      }

      bomb.turns -= 1;
      if (bomb.turns > 0) {
        continue;
      }

      delete piece.status.bomb;
      this.pushEvent({
        type: 'status',
        id: piece.id,
        status: 'bomb',
        removed: true,
        col: piece.col,
        row: piece.row,
        color: piece.color,
      });

      const cells = areaCells(bomb.area ?? 'square3', piece.col, piece.row);
      for (const cell of cells) {
        const victim = this.getPieceAt(cell.col, cell.row);
        if (victim) {
          dealDamage(this, victim, bomb.damage ?? 0, {});
        }
      }

      if (bomb.killHolder && this.pieces.includes(piece)) {
        removePiece(this, piece, {});
      }
    }

    for (const piece of [...this.pieces]) {
      if (!this.pieces.includes(piece)) {
        continue;
      }
      const expire = piece.status?.expire;
      if (!expire || piece.color !== color) {
        continue;
      }

      expire.turns -= 1;
      if (expire.turns <= 0) {
        delete piece.status.expire;
        this.pushEvent({
          type: 'status',
          id: piece.id,
          status: 'expire',
          removed: true,
          col: piece.col,
          row: piece.row,
          color: piece.color,
        });
        removePiece(this, piece, { exile: true });
      }
    }
  }

  updateTempo(color, value) {
    this.heroes[color].tempo += value
  }

  setTempo(color, value) {
    this.heroes[color].tempo = value
  }

  getTempo(color) {
    return this.heroes[color].tempo
  }
}
