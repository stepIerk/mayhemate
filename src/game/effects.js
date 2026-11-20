import { dealDamage, healPiece, removePiece } from './damage.js';
import {
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

  const next = {};

  for (const paramKey of STATUS_PARAM_KEYS) {
    if (op[paramKey] !== undefined) {
      next[paramKey] = op[paramKey];
    }
  }

  if (key === 'bomb') {
    next.by = op.by ?? caster;
  }

  const current = piece.status[key];

  if (current && typeof next.turns === 'number' && typeof current.turns === 'number') {
    next.turns = Math.max(next.turns, current.turns);
  }

  if (current && typeof next.charges === 'number' && typeof current.charges === 'number') {
    next.charges += current.charges;
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
    const targets = selectTargets(game, op, ctx.caster, ctx.col, ctx.row);

    for (const target of targets) {
      applyStatus(target, op, ctx.caster, game);
    }

    if (targets.length > 0 && Array.isArray(op.then)) {
      runNested(game, op.then, ctx);
    }

    return targets.length > 0;
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
