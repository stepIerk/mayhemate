import { dealDamage, healPiece, removePiece } from './damage.js';
import { PIECE_TYPES } from './pieces.js';
import { randomInt, shuffleInPlace } from './rng.js';
import {
  checkTraps,
  destroyTraps,
  hasTrap,
  placeRandomTraps,
  placeTrap,
  revealTraps,
} from './traps.js';

const BOARD_SIZE = 8;
export const TEMPO_HARD_CAP = 7;

const NESTED_KEYS = ['then', 'onKill'];

function opponent(color) {
  return color === 'white' ? 'black' : 'white';
}

export function cellInZone(color, col, row, zone) {
  switch (zone) {
    case 'own_home2':
      return color === 'white' ? row >= 6 : row <= 1;
    case 'own_half':
      return color === 'white' ? row >= 4 : row <= 3;
    case 'enemy_half':
      return color === 'white' ? row <= 3 : row >= 4;
    default:
      return true;
  }
}

function isInsideBoard(col, row) {
  return col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE;
}

export function validateRequires(game, requires, caster, col, row) {
  const req = requires ?? { cell: 'any' };
  const piece = game.getPieceAt(col, row);

  if (req.cell === 'empty' && piece) {
    return false;
  }

  if (req.cell === 'piece' && !piece) {
    return false;
  }

  if (piece) {
    if (req.owner === 'ally' && piece.color !== caster) {
      return false;
    }

    if (req.owner === 'enemy' && piece.color === caster) {
      return false;
    }

    if (Array.isArray(req.types) && !req.types.includes(piece.type)) {
      return false;
    }

    if (Array.isArray(req.notTypes) && req.notTypes.includes(piece.type)) {
      return false;
    }

    if (typeof req.hpMax === 'number' && piece.hp > req.hpMax) {
      return false;
    }

    if (typeof req.hpMin === 'number' && piece.hp < req.hpMin) {
      return false;
    }

    if (req.acted === true && !game.turnMove.includes(piece.id)) {
      return false;
    }
  } else {
    if (req.owner) {
      return false;
    }

    if (
      Array.isArray(req.types) ||
      typeof req.hpMax === 'number' ||
      typeof req.hpMin === 'number' ||
      req.acted === true
    ) {
      return false;
    }
  }

  if (req.noTrap === true && game.traps.some((trap) => trap.col === col && trap.row === row)) {
    return false;
  }

  if (req.zone && !cellInZone(caster, col, row, req.zone)) {
    return false;
  }

  if (req.graveyard) {
    const pile =
      game.graveyard[
        req.graveyard === 'own' ? caster : opponent(caster)
      ];

    const suitable = (pile ?? []).some(
      (entry) =>
        !(Array.isArray(req.notTypes) && req.notTypes.includes(entry.type))
    );

    if (!suitable) {
      return false;
    }
  }

  return true;
}

export function areaCells(area, col, row) {
  const cells = [];

  const push = (c, r) => {
    if (isInsideBoard(c, r)) {
      cells.push({ col: c, row: r });
    }
  };

  switch (area) {
    case 'adjacent8':
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dc !== 0 || dr !== 0) {
            push(col + dc, row + dr);
          }
        }
      }
      break;
    case 'square3':
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          push(col + dc, row + dr);
        }
      }
      break;
    case 'square5':
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          push(col + dc, row + dr);
        }
      }
      break;
    case 'cross':
      push(col, row);
      push(col + 1, row);
      push(col - 1, row);
      push(col, row + 1);
      push(col, row - 1);
      break;
    case 'row':
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        push(c, row);
      }
      break;
    case 'col':
      for (let r = 0; r < BOARD_SIZE; r += 1) {
        push(col, r);
      }
      break;
    case 'board':
      for (let r = 0; r < BOARD_SIZE; r += 1) {
        for (let c = 0; c < BOARD_SIZE; c += 1) {
          push(c, r);
        }
      }
      break;
    default:
      push(col, row);
      break;
  }

  return cells;
}

function matchesFilter(piece, filter, caster) {
  if (!filter) {
    return true;
  }

  if (filter.owner === 'ally' && piece.color !== caster) {
    return false;
  }

  if (filter.owner === 'enemy' && piece.color === caster) {
    return false;
  }

  if (Array.isArray(filter.types) && !filter.types.includes(piece.type)) {
    return false;
  }

  if (
    Array.isArray(filter.notTypes) &&
    filter.notTypes.includes(piece.type)
  ) {
    return false;
  }

  return true;
}

export function selectTargets(game, op, caster, col, row) {
  const cells = areaCells(op.area ?? 'cell', col, row);
  const targets = [];

  for (const cell of cells) {
    const piece = game.getPieceAt(cell.col, cell.row);

    if (piece && matchesFilter(piece, op.filter, caster)) {
      targets.push(piece);
    }
  }

  targets.sort((a, b) => a.row - b.row || a.col - b.col);
  return targets;
}

const STATUS_PARAM_KEYS = [
  'turns',
  'charges',
  'damage',
  'area',
  'killHolder',
];

function applyStatus(piece, op, caster, game) {
  const key = op.status;

  if (!key) {
    return false;
  }

  const current = piece.status[key];

  const next = {};

  for (const paramKey of STATUS_PARAM_KEYS) {
    if (op[paramKey] !== undefined) {
      next[paramKey] = op[paramKey];
    } else if (current && current[paramKey] !== undefined) {
      next[paramKey] = current[paramKey];
    }
  }

  if (key === 'bomb') {
    next.by = op.by ?? current?.by ?? caster;
  }

  if (current && typeof next.turns === 'number' && typeof current.turns === 'number') {
    next.turns = Math.max(next.turns, current.turns);
  }

  if (current && typeof next.charges === 'number' && typeof current.charges === 'number' && op.charges !== undefined) {
    next.charges += current.charges;
  } else if (current && typeof next.charges === 'number' && typeof current.charges === 'number' && op.charges === undefined) {
    next.charges = current.charges;
  }

  piece.status[key] = next;
  game.pushEvent({
    type: 'status',
    id: piece.id,
    status: key,
    col: piece.col,
    row: piece.row,
    color: piece.color,
  });
  return true;
}

function runNested(game, ops, ctx) {
  if (!Array.isArray(ops)) {
    return;
  }

  for (const op of ops) {
    applyEffect(game, op, ctx);
  }
}

function pushEvent(game, event) {
  game.pushEvent(event);
}

function getKing(game, color) {
  return game.pieces.find((piece) => piece.type === 'king' && piece.color === color);
}

function baseStats(type) {
  return PIECE_TYPES[type] ?? { hp: 1, atk: 0 };
}

function summonPiece(game, type, col, row, color, op, caster) {
  const stats = baseStats(type);
  const hp = typeof op.hp === 'number' ? op.hp : stats.hp;
  const atk = typeof op.atk === 'number' ? op.atk : stats.atk;
  const piece = game.addPiece(type, col, row, color);
  piece.hp = hp;
  piece.maxHp = hp;
  piece.atk = atk;
  piece.tempAtk = 0;

  const statuses = Array.isArray(op.status)
    ? op.status
    : op.status
      ? [op.status]
      : [];

  for (const statusOp of statuses) {
    applyStatus(piece, statusOp, caster, game);
  }

  if (op.exhausted) {
    game.turnMove.push(piece.id);
  }

  pushEvent(game, {
    type: 'summon',
    id: piece.id,
    pieceType: type,
    col,
    row,
    color,
  });

  checkTraps(game, piece);
  return piece;
}

const handlers = {
  damage(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);

    if (targets.length === 0) {
      return false;
    }

    let killed = false;

    for (const target of targets) {
      const result = dealDamage(game, target, op.amount, {
        pierce: Boolean(op.pierce),
      });

      if (result.died) {
        killed = true;
      }
    }

    if (killed && Array.isArray(op.onKill)) {
      runNested(game, op.onKill, ctx);
    }

    if (Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return true;
  },

  heal(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);

    for (const target of targets) {
      healPiece(game, target, op.amount);
    }

    if (targets.length > 0 && Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return targets.length > 0;
  },

  buff(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);

    for (const target of targets) {
      if (typeof op.hp === 'number' && op.duration !== 'turn') {
        target.hp += op.hp;
        target.maxHp += op.hp;
      }

      if (typeof op.atk === 'number') {
        if (op.duration === 'turn') {
          target.tempAtk += op.atk;
        } else {
          target.atk = Math.max(0, target.atk + op.atk);
        }
      }

      game.pushEvent({
        type: 'buff',
        id: target.id,
        col: target.col,
        row: target.row,
        color: target.color,
        hp: op.hp ?? 0,
        atk: op.atk ?? 0,
        duration: op.duration ?? 'permanent',
      });
    }

    if (targets.length > 0 && Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return targets.length > 0;
  },

  kill(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);

    for (const target of targets) {
      removePiece(game, target, {
        exile: Boolean(op.exile),
        byId: undefined,
      });
    }

    if (targets.length > 0 && Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return targets.length > 0;
  },

  set_status(game, op, ctx) {
    const selection = op.filter ? op : { ...op, area: 'cell' };
    const targets = selectTargets(game, selection, ctx.caster, ctx.col, ctx.row);

    for (const target of targets) {
      applyStatus(target, op, ctx.caster, game);
    }

    if (targets.length > 0 && Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return targets.length > 0;
  },

  push(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);
    if (targets.length === 0) {
      return false;
    }

    const distance = Math.max(1, op.distance ?? 1);
    const collisionDamage = op.collisionDamage;

    const ordered = [...targets].sort((a, b) => {
      const da = Math.abs(a.col - ctx.col) + Math.abs(a.row - ctx.row);
      const db = Math.abs(b.col - ctx.col) + Math.abs(b.row - ctx.row);
      return db - da;
    });

    for (const target of ordered) {
      const dc = Math.sign(target.col - ctx.col);
      const dr = Math.sign(target.row - ctx.row);
      const newCol = target.col + dc * distance;
      const newRow = target.row + dr * distance;

      if (!isInsideBoard(newCol, newRow)) {
        if (typeof collisionDamage === 'number' && collisionDamage > 0) {
          dealDamage(game, target, collisionDamage, {});
        }
        continue;
      }

      const occupant = game.getPieceAt(newCol, newRow);
      if (occupant) {
        if (typeof collisionDamage === 'number' && collisionDamage > 0) {
          dealDamage(game, target, collisionDamage, {});
        }
        continue;
      }

      game.movePiece(target, newCol, newRow);
      pushEvent(game, {
        type: 'move',
        pieceId: target.id,
        from: { col: target.col - dc * distance, row: target.row - dr * distance },
        to: { col: newCol, row: newRow },
      });
      checkTraps(game, target);
    }

    return true;
  },

  teleport(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);
    if (targets.length === 0) {
      return false;
    }

    const radius = op.to?.radius ?? (op.radius ?? 1);

    for (const target of targets) {
      const candidates = [];
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          const col = target.col + dc;
          const row = target.row + dr;
          if (!isInsideBoard(col, row)) {
            continue;
          }
          if (game.getPieceAt(col, row)) {
            continue;
          }
          if (hasTrap(game, col, row)) {
            // still allowed as empty cell; traps trigger after
          }
          candidates.push({ col, row });
        }
      }

      if (candidates.length === 0) {
        continue;
      }

      const pick = randomInt(game, candidates.length);
      const cell = candidates[pick];
      const from = { col: target.col, row: target.row };
      game.movePiece(target, cell.col, cell.row);
      pushEvent(game, {
        type: 'move',
        pieceId: target.id,
        from,
        to: { col: cell.col, row: cell.row },
      });
      checkTraps(game, target);
    }

    return true;
  },

  swap(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);
    if (targets.length === 0) {
      return false;
    }

    const king = getKing(game, ctx.caster);
    if (!king) {
      return false;
    }

    for (const target of targets) {
      if (target === king) {
        continue;
      }
      const kingCol = king.col;
      const kingRow = king.row;
      const targetCol = target.col;
      const targetRow = target.row;

      game.movePiece(king, targetCol, targetRow);
      game.movePiece(target, kingCol, kingRow);

      pushEvent(game, {
        type: 'move',
        pieceId: king.id,
        from: { col: kingCol, row: kingRow },
        to: { col: targetCol, row: targetRow },
      });
      pushEvent(game, {
        type: 'move',
        pieceId: target.id,
        from: { col: targetCol, row: targetRow },
        to: { col: kingCol, row: kingRow },
      });

      checkTraps(game, king);
      checkTraps(game, target);
    }

    return true;
  },

  summon(game, op, ctx) {
    if (game.getPieceAt(ctx.col, ctx.row)) {
      return false;
    }

    const type = op.type;
    if (!PIECE_TYPES[type]) {
      return false;
    }

    summonPiece(game, type, ctx.col, ctx.row, ctx.caster, op, ctx.caster);
    return true;
  },

  resurrect(game, op, ctx) {
    if (game.getPieceAt(ctx.col, ctx.row)) {
      return false;
    }

    const pileKey = op.from === 'enemy' ? opponent(ctx.caster) : ctx.caster;
    const pile = game.graveyard[pileKey];
    if (!Array.isArray(pile) || pile.length === 0) {
      return false;
    }

    let index = pile.length - 1;
    while (index >= 0) {
      const entry = pile[index];
      if (Array.isArray(op.notTypes) && op.notTypes.includes(entry.type)) {
        index -= 1;
        continue;
      }
      break;
    }

    if (index < 0) {
      return false;
    }

    const entry = pile.splice(index, 1)[0];
    const type = entry.type;
    const stats = baseStats(type);
    const color =
      op.asOwner === 'self' || op.from === 'own' || op.from !== 'enemy'
        ? ctx.caster
        : entry.color;

    let hp;
    if (op.hp === 'half') {
      hp = Math.ceil(stats.hp / 2);
    } else if (typeof op.hp === 'number') {
      hp = op.hp;
    } else {
      hp = stats.hp;
    }

    const piece = game.addPiece(type, ctx.col, ctx.row, color);
    piece.hp = hp;
    piece.maxHp = stats.hp;
    piece.atk = stats.atk;
    piece.tempAtk = 0;
    piece.status = {};

    const statuses = Array.isArray(op.status)
      ? op.status
      : op.status
        ? [op.status]
        : [];

    for (const statusOp of statuses) {
      applyStatus(piece, statusOp, ctx.caster, game);
    }

    if (op.exhausted) {
      game.turnMove.push(piece.id);
    }

    pushEvent(game, {
      type: 'resurrect',
      id: piece.id,
      pieceType: type,
      col: ctx.col,
      row: ctx.row,
      color,
    });

    checkTraps(game, piece);
    return true;
  },

  transform(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);
    if (targets.length === 0) {
      return false;
    }

    const type = op.type;
    if (!PIECE_TYPES[type]) {
      return false;
    }

    const stats = baseStats(type);

    for (const target of targets) {
      target.type = type;
      target.hp = stats.hp;
      target.maxHp = stats.hp;
      target.atk = stats.atk;
      target.tempAtk = 0;

      pushEvent(game, {
        type: 'transform',
        id: target.id,
        pieceType: type,
        col: target.col,
        row: target.row,
        color: target.color,
      });
    }

    return true;
  },

  set_owner(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);
    if (targets.length === 0) {
      return false;
    }

    for (const target of targets) {
      target.color = op.to === 'caster' ? ctx.caster : target.color;

      if (op.exhausted) {
        game.turnMove.push(target.id);
      }

      pushEvent(game, {
        type: 'set_owner',
        id: target.id,
        col: target.col,
        row: target.row,
        color: target.color,
      });
    }

    return true;
  },

  grant_action(game, op, ctx) {
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);
    if (targets.length === 0) {
      return false;
    }

    for (const target of targets) {
      game.turnMove = game.turnMove.filter((id) => id !== target.id);
    }

    if (op.resetMoveFlag) {
      game.movedThisTurn = false;
    }

    return true;
  },

  draw(game, op, ctx) {
    const who = op.who === 'opponent' ? opponent(ctx.caster) : ctx.caster;
    const drawn = game.cards.draw(who, op.count ?? 1);

    pushEvent(game, {
      type: 'draw',
      color: who,
      count: drawn.length,
    });

    return drawn.length > 0;
  },

  discard_random(game, op, ctx) {
    const who = op.who === 'opponent' ? opponent(ctx.caster) : ctx.caster;
    const hand = game.cards.hands[who];
    if (!hand || hand.length === 0) {
      return false;
    }

    const count = Math.min(op.count ?? 1, hand.length);
    const indices = hand.map((_, index) => index);
    shuffleInPlace(game, indices);
    const toDiscard = indices.slice(0, count).sort((a, b) => b - a);

    for (const index of toDiscard) {
      const [card] = hand.splice(index, 1);
      game.cards.discard.push(card);
      pushEvent(game, {
        type: 'discard',
        color: who,
        cardId: card.cardId,
        cardUid: card.uid,
      });
    }

    if (toDiscard.length > 0 && Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return toDiscard.length > 0;
  },

  steal_card(game, op, ctx) {
    const opponentColor = opponent(ctx.caster);
    const source = game.cards.hands[opponentColor];
    const destination = game.cards.hands[ctx.caster];

    if (!source || source.length === 0) {
      return false;
    }

    const count = Math.max(1, op.count ?? 1);
    let stolen = 0;

    for (let index = 0; index < count && source.length > 0; index += 1) {
      const pick = randomInt(game, source.length);
      const [card] = source.splice(pick, 1);

      if (destination.length >= 6) {
        game.cards.discard.push(card);
      } else {
        destination.push(card);
      }

      pushEvent(game, {
        type: 'steal',
        from: opponentColor,
        to: ctx.caster,
        cardId: card.cardId,
        cardUid: card.uid,
      });

      stolen += 1;
    }

    return stolen > 0;
  },

  tempo_next_turn(game, op, ctx) {
    const color =
      op.who === 'opponent' ? opponent(ctx.caster) : ctx.caster;
    game.tempoMod[color] += op.amount ?? 0;
    if (typeof op.min === 'number') {
      game.tempoModMin[color] = Math.max(
        game.tempoModMin?.[color] ?? 1,
        op.min
      );
    }
    return true;
  },

  tempo(game, op, ctx) {
    const color =
      op.who === 'opponent' ? opponent(ctx.caster) : ctx.caster;
    const hero = game.heroes[color];
    const before = hero.tempo;
    hero.tempo = Math.min(TEMPO_HARD_CAP, hero.tempo + op.amount);

    if (hero.tempo !== before) {
      game.pushEvent({
        type: 'tempo',
        color,
        amount: hero.tempo - before,
        tempo: hero.tempo,
      });
      return true;
    }

    return false;
  },

  place_trap(game, op, ctx) {
    const kind = op.trap ?? op.kind ?? 'mine';
    const params = {};

    if (op.damage !== undefined) {
      params.damage = op.damage;
    }
    if (op.turns !== undefined) {
      params.turns = op.turns;
    }
    Object.assign(params, op.params ?? {});

    if (op.random) {
      const placed = placeRandomTraps(game, ctx.caster, {
        zone: op.random.zone ?? 'any',
        count: op.random.count ?? 1,
        kind,
        params,
      });
      return placed.length > 0;
    }

    if (op.zone && op.zone !== 'any') {
      const placed = placeRandomTraps(game, ctx.caster, {
        zone: op.zone,
        count: op.count ?? 1,
        kind,
        params,
      });
      return placed.length > 0;
    }

    const empty =
      !game.getPieceAt(ctx.col, ctx.row) && !hasTrap(game, ctx.col, ctx.row);

    if (!empty) {
      return false;
    }

    placeTrap(game, {
      col: ctx.col,
      row: ctx.row,
      owner: ctx.caster,
      kind,
      params,
    });
    return true;
  },

  destroy_trap(game, op, ctx) {
    const owner =
      op.owner === 'enemy'
        ? opponent(ctx.caster)
        : op.owner === 'ally'
          ? ctx.caster
          : 'any';
    const removed = destroyTraps(game, {
      col: ctx.col,
      row: ctx.row,
      owner,
    });

    if (removed.length > 0 && Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return removed.length > 0;
  },

  reveal_traps(game, op, ctx) {
    const cells =
      op.area === 'board'
        ? Array.from({ length: 64 }, (_, index) => ({
            col: index % 8,
            row: Math.floor(index / 8),
          }))
        : areaCells(op.area ?? 'cell', ctx.col, ctx.row);
    const revealed = revealTraps(game, ctx.caster, cells);
    return revealed > 0;
  },
};

export function applyEffect(game, op, ctx) {
  const handler = handlers[op?.op];

  if (!handler) {
    console.warn(`[effects] unknown op: ${op?.op}`);
    return false;
  }

  return handler(game, op, ctx) === true;
}

export function applyEffects(game, effects, ctx) {
  if (!Array.isArray(effects)) {
    return;
  }

  for (const op of effects) {
    applyEffect(game, op, ctx);
  }
}

export { NESTED_KEYS };
