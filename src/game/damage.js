const KING = 'king';

function isOnBoard(game, piece) {
  return game.pieces.includes(piece);
}

function pushEvent(game, event) {
  game.pushEvent(event);
}

export function healPiece(game, piece, amount) {
  if (!piece || !(amount > 0)) {
    return 0;
  }

  const before = piece.hp;
  const maxHp =
    typeof piece.maxHp === 'number' ? piece.maxHp : piece.hp;
  piece.hp = Math.min(maxHp, piece.hp + amount);
  const healed = piece.hp - before;

  if (healed > 0) {
    pushEvent(game, {
      type: 'heal',
      id: piece.id,
      amount: healed,
      hp: piece.hp,
      col: piece.col,
      row: piece.row,
      color: piece.color,
    });
  }

  return healed;
}

export function removePiece(game, piece, opts = {}) {
  const index = game.pieces.indexOf(piece);

  if (index === -1) {
    return false;
  }

  game.pieces.splice(index, 1);

  if (!opts.exile) {
    game.graveyard[piece.color].push({
      type: piece.type,
      color: piece.color,
      id: piece.id,
    });
  }

  const event = {
    type: 'kill',
    pieceId: piece.id,
    col: piece.col,
    row: piece.row,
    color: piece.color,
  };

  if (opts.byId !== undefined) {
    event.byId = opts.byId;
  }

  if (opts.exile) {
    event.exile = true;
  }

  pushEvent(game, event);

  if (piece.type === KING && !game.gameOver) {
    const winner = piece.color === 'white' ? 'black' : 'white';
    game.gameOver = { loser: piece.color, winner };
    pushEvent(game, {
      type: 'game_over',
      loser: piece.color,
      winner,
    });
  }

  return true;
}

function applyThorns(game, target, attacker) {
  const thorns = target.status?.thorns;

  if (!thorns || !attacker || attacker === target) {
    return;
  }

  dealDamage(game, attacker, thorns.damage, {});
}

export function dealDamage(game, target, amount, opts = {}) {
  if (!target || !(amount > 0)) {
    return { dealt: 0, blocked: false, died: false };
  }

  const pierce = Boolean(opts.pierce);
  const attacker = opts.attacker ?? null;
  const shield = target.status?.shield;

  if (!pierce && shield && shield.charges > 0) {
    shield.charges -= 1;

    if (shield.charges <= 0) {
      delete target.status.shield;
    }

    pushEvent(game, {
      type: 'shield',
      id: target.id,
      col: target.col,
      row: target.row,
      color: target.color,
    });

    if (attacker && target.status?.thorns) {
      applyThorns(game, target, attacker);
    }

    return { dealt: 0, blocked: true, died: false };
  }

  target.hp -= amount;

  pushEvent(game, {
    type: 'damage',
    id: target.id,
    amount,
    hp: target.hp,
    col: target.col,
    row: target.row,
    color: target.color,
  });

  let died = false;

  if (target.hp <= 0) {
    removePiece(game, target, { byId: attacker?.id });
    died = true;
  }

  if (
    attacker &&
    attacker.status?.lifelink &&
    amount > 0 &&
    isOnBoard(game, attacker)
  ) {
    healPiece(game, attacker, amount);
  }

  if (target.status?.thorns) {
    applyThorns(game, target, attacker);
  }

  return { dealt: amount, blocked: false, died };
}
