import fs from 'node:fs';
import { setCardCatalog, findCardDefinition } from '../src/game/deck.js';
import { Game } from '../src/game/Game.js';
import { playCardAction } from '../src/game/actions.js';

const raw = JSON.parse(fs.readFileSync(new URL('../public/assets/cards/cards.json', import.meta.url)));

function inZone(color, col, row, zone) {
  if (!zone) return true;
  if (zone === 'own_home2') return color === 'white' ? row >= 6 : row <= 1;
  if (zone === 'own_half') return color === 'white' ? row >= 4 : row <= 3;
  if (zone === 'enemy_half') return color === 'white' ? row <= 3 : row >= 4;
  return true;
}

function setupCard(card) {
  setCardCatalog({ cards: [card] });
  const game = new Game();
  game.pieces = [];
  game.eventBuffer = [];
  game.setTempo('white', 10);

  const req = card.requires ?? {};
  const color = req.owner === 'enemy' ? 'black' : 'white';
  let target = { col: 4, row: 4 };

  if (req.cell === 'empty') {
    const zone = req.zone ?? 'any';
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if (inZone('white', col, row, zone)) {
          target = { col, row };
          break;
        }
      }
      if (inZone('white', target.col, target.row, zone)) break;
    }
  }

  let piece = null;
  if (req.cell === 'piece') {
    const type = Array.isArray(req.types) ? req.types[0] : 'pawn';
    piece = game.addPiece(type, target.col, target.row, color);
    if (typeof req.hpMax === 'number') piece.hp = Math.min(piece.hp, req.hpMax);
    if (typeof req.hpMin === 'number') piece.hp = Math.max(piece.hp, req.hpMin);
    if (req.acted) game.turnMove.push(piece.id);
  }

  // neighbors for area effects
  const neighbors = [
    [target.col + 1, target.row],
    [target.col - 1, target.row],
    [target.col, target.row + 1],
    [target.col, target.row - 1],
  ];
  for (const [col, row] of neighbors) {
    if (col >= 0 && col < 8 && row >= 0 && row < 8 && !game.getPieceAt(col, row)) {
      game.addPiece('pawn', col, row, color === 'white' ? 'black' : 'white');
    }
  }

  if (req.graveyard) {
    const pile = req.graveyard === 'enemy' ? 'black' : 'white';
    game.graveyard[pile].push({ type: 'pawn', color: pile, id: 999 });
  }

  const cardUid = game.cards.hands.white[0]?.uid;
  return { game, target, piece, cardUid };
}

for (const card of raw.cards) {
  const { game, target, cardUid, piece } = setupCard(card);
  const before = {
    tempo: game.getTempo('white'),
    hand: game.cards.hands.white.length,
    discard: game.cards.discard.length,
    traps: game.traps.length,
    pieces: game.pieces.length,
    hp: piece?.hp,
    atk: piece?.atk,
    status: JSON.stringify(piece?.status ?? {}),
  };
  const res = game.applyAction(playCardAction(cardUid, target.col, target.row));
  const after = {
    tempo: game.getTempo('white'),
    hand: game.cards.hands.white.length,
    discard: game.cards.discard.length,
    traps: game.traps.length,
    pieces: game.pieces.length,
    hp: piece && game.pieces.includes(piece) ? piece.hp : 'gone',
    atk: piece && game.pieces.includes(piece) ? piece.atk : 'gone',
    status: piece && game.pieces.includes(piece) ? JSON.stringify(piece.status) : 'gone',
    owners: game.pieces.filter(p => p.type !== 'pawn' || true).map(p => `${p.type}:${p.color}:${p.hp}`).join(','),
  };
  const events = (res.events ?? []).map(e => e.type).join(',');
  console.log(
    `${card.id.padEnd(14)} ok=${res.ok}${res.ok ? '' : ' reason=' + res.reason} ` +
    `tempo ${before.tempo}->${after.tempo} hand ${before.hand}->${after.hand} disc ${before.discard}->${after.discard} ` +
    `traps ${before.traps}->${after.traps} pieces ${before.pieces}->${after.pieces} ` +
    `hp ${before.hp}->${after.hp} atk ${before.atk}->${after.atk} st ${before.status}->${after.status} ev=[${events}]`
  );
}
