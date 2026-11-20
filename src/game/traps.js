import { dealDamage } from './damage.js';
import { randomInt } from './rng.js';
import { cellInZone } from './effects.js';

export function nextTrapId(game) {
  const seq = (game.nextTrapId ?? 1) + 1;
  game.nextTrapId = seq;
  return `t${seq}`;
}

export function trapAt(game, col, row) {
  return game.traps.filter((trap) => trap.col === col && trap.row === row);
}

export function hasTrap(game, col, row) {
  return game.traps.some((trap) => trap.col === col && trap.row === row);
}

export function placeTrap(game, { col, row, owner, kind, params = {} }) {
  const trap = {
    id: nextTrapId(game),
    col,
    row,
    owner,
    kind,
    params: { ...params },
    revealedTo: [owner],
  };

  game.traps.push(trap);
  game.pushEvent({
    type: 'trap_placed',
    trapId: trap.id,
    col,
    row,
    owner,
    kind,
    forOwner: owner,
  });
  return trap;
}

function emptyCellsInZone(game, caster, zone) {
  const cells = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (!cellInZone(caster, col, row, zone)) {
        continue;
      }

      if (game.getPieceAt(col, row)) {
        continue;
      }

      if (hasTrap(game, col, row)) {
        continue;
      }

      cells.push({ col, row });
    }
  }

  return cells;
}

export function placeRandomTraps(game, caster, spec) {
  const cells = emptyCellsInZone(game, caster, spec.zone ?? 'any');
  const count = Math.max(0, spec.count ?? 1);
  const placed = [];

  for (let index = 0; index < count && cells.length > 0; index += 1) {
    const pick = randomInt(game, cells.length);
    const [cell] = cells.splice(pick, 1);
    placed.push(
      placeTrap(game, {
        ...cell,
        owner: caster,
        kind: spec.kind,
        params: { ...spec.params },
      })
    );
  }

  return placed;
}

export function destroyTraps(game, { col, row, owner }) {
  const removed = [];

  game.traps = game.traps.filter((trap) => {
    if (trap.col !== col || trap.row !== row) {
      return true;
    }

    if (owner && owner !== 'any' && trap.owner !== owner) {
      return true;
    }

    removed.push(trap);
    return false;
  });

  return removed;
}

export function revealTraps(game, caster, cells) {
  let revealed = 0;

  for (const trap of game.traps) {
    if (trap.owner === caster) {
      continue;
    }

    const inside = cells.some(
      (cell) => cell.col === trap.col && cell.row === trap.row
    );

    if (inside && !trap.revealedTo.includes(caster)) {
      trap.revealedTo.push(caster);
      revealed += 1;
    }
  }

  return revealed;
}

function setFrozen(game, piece, turns) {
  const current = piece.status.frozen?.turns ?? 0;
  piece.status.frozen = { turns: Math.max(current, turns) };
  game.pushEvent({
    type: 'status',
    id: piece.id,
    status: 'frozen',
    col: piece.col,
    row: piece.row,
    color: piece.color,
  });
}

export function checkTraps(game, piece) {
  if (!piece || !game.pieces.includes(piece)) {
    return;
  }

  const triggers = trapAt(game, piece.col, piece.row).filter(
    (trap) => trap.owner !== piece.color
  );

  if (triggers.length === 0) {
    return;
  }

  for (const trap of triggers) {
    if (!game.pieces.includes(piece)) {
      break;
    }

    game.traps = game.traps.filter((entry) => entry.id !== trap.id);

    game.pushEvent({
      type: 'trap',
      trapId: trap.id,
      col: trap.col,
      row: trap.row,
      kind: trap.kind,
      owner: trap.owner,
      pieceId: piece.id,
    });

    if (trap.kind === 'mine') {
      dealDamage(game, piece, trap.params.damage ?? 0, {});
    } else if (trap.kind === 'frost_trap') {
      setFrozen(game, piece, trap.params.turns ?? 1);
    }
  }
}
