import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from './Game.js';
import { setCardCatalog } from './deck.js';
import { playCardAction } from './actions.js';

const CATALOG = JSON.parse(
  fs.readFileSync(path.resolve('public/assets/cards/cards.json'), 'utf8')
);

beforeAll(() => setCardCatalog(CATALOG));
afterAll(() => setCardCatalog(null));

function setup(cardId, pieces = [], tempo = 7, hands = {}) {
  const game = new Game();
  game.pieces = [];
  game.setTempo('white', tempo);
  game.cards.hands.white = [{ uid: 'test', cardId }];
  if (hands.white) game.cards.hands.white.push(...hands.white);
  if (hands.black) game.cards.hands.black = hands.black;
  for (const [type, col, row, color, props = {}] of pieces) {
    const piece = game.addPiece(type, col, row, color);
    Object.assign(piece, props);
  }
  return game;
}

function play(game, col, row, uid = 'test') {
  return game.applyAction(playCardAction(uid, col, row));
}

describe('damage cards', () => {
  it('spark deals 1', () => {
    const g = setup('spark', [['pawn', 2, 2, 'black']]);
    const p = g.pieces[0];
    expect(play(g, 2, 2).ok).toBe(true);
    expect(p.hp).toBe(p.maxHp - 1);
  });

  it('lightning kills and returns tempo', () => {
    const g = setup('lightning', [['pawn', 2, 2, 'black', { hp: 2 }]], 5);
    const before = g.getTempo('white');
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.pieces).toHaveLength(0);
    expect(g.getTempo('white')).toBe(before - 2 + 1);
  });

  it('fireball hits center and neighbors', () => {
    const g = setup('fireball', [
      ['rook', 4, 4, 'black'],
      ['pawn', 3, 4, 'black'],
      ['pawn', 5, 4, 'white'],
    ]);
    const [center, near, ally] = g.pieces;
    expect(play(g, 4, 4).ok).toBe(true);
    expect(center.hp).toBe(center.maxHp - 2);
    expect(near.hp).toBe(near.maxHp - 1);
    expect(ally.hp).toBe(ally.maxHp - 1);
  });

  it('volley hits only enemies in row', () => {
    const g = setup('volley', [
      ['pawn', 1, 3, 'black'],
      ['pawn', 6, 3, 'white'],
    ]);
    const [enemy, ally] = g.pieces;
    expect(play(g, 0, 3).ok).toBe(true);
    expect(enemy.hp).toBe(enemy.maxHp - 1);
    expect(ally.hp).toBe(ally.maxHp);
  });

  it('meteor hits 3x3', () => {
    const g = setup('meteor', [
      ['pawn', 3, 3, 'black'],
      ['pawn', 6, 6, 'black'],
    ]);
    const [inside, outside] = g.pieces;
    expect(play(g, 4, 4).ok).toBe(true);
    expect(inside.hp).toBe(inside.maxHp - 3);
    expect(outside.hp).toBe(outside.maxHp);
  });

  it('berserk damages self then buffs tempAtk', () => {
    const g = setup('berserk', [['pawn', 2, 2, 'white']]);
    const p = g.pieces[0];
    expect(play(g, 2, 2).ok).toBe(true);
    expect(p.hp).toBe(p.maxHp - 1);
    expect(p.tempAtk).toBe(2);
  });
});

describe('kill / status cards', () => {
  it('execute removes a weak enemy', () => {
    const g = setup('execute', [['pawn', 2, 2, 'black', { hp: 2 }]]);
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.pieces).toHaveLength(0);
    expect(g.graveyard.black).toHaveLength(1);
  });

  it('poison ticks at owner turn start', () => {
    const g = setup('poison', [['pawn', 2, 2, 'black']]);
    const p = g.pieces[0];
    expect(play(g, 2, 2).ok).toBe(true);
    expect(p.status.poison).toMatchObject({ turns: 3, damage: 1 });
    g.turn = 'white';
    g.endTurn();
    expect(p.hp).toBe(p.maxHp - 1);
    expect(p.status.poison.turns).toBe(2);
  });

  it('time_bomb explodes on holder turn', () => {
    const g = setup('time_bomb', [
      ['pawn', 2, 2, 'black'],
      ['rook', 3, 2, 'white'],
    ]);
    const [holder, neighbor] = g.pieces;
    expect(play(g, 2, 2).ok).toBe(true);
    expect(holder.status.bomb).toMatchObject({ by: 'white', turns: 2 });
    g.turn = 'black';
    g.endTurn();
    expect(holder.status.bomb.turns).toBe(1);
    g.turn = 'black';
    g.endTurn();
    expect(g.pieces).not.toContain(holder);
    expect(neighbor.hp).toBeLessThan(neighbor.maxHp);
  });

  it('weaken reduces atk permanently', () => {
    const g = setup('weaken', [['rook', 2, 2, 'black']]);
    const p = g.pieces[0];
    expect(play(g, 2, 2).ok).toBe(true);
    expect(p.atk).toBe(1);
  });

  it('bless increases hp and maxHp', () => {
    const g = setup('bless', [['pawn', 2, 2, 'white']]);
    const p = g.pieces[0];
    expect(play(g, 2, 2).ok).toBe(true);
    expect([p.hp, p.maxHp]).toEqual([p.maxHp, 3]);
  });

  it('battle_cry gives tempAtk to all allies', () => {
    const g = setup('battle_cry', [
      ['pawn', 2, 2, 'white'],
      ['rook', 5, 5, 'white'],
    ]);
    expect(play(g, 0, 0).ok).toBe(true);
    expect(g.pieces.every((p) => p.tempAtk === 1)).toBe(true);
  });

  it('heal restores hp up to maxHp', () => {
    const g = setup('heal', [['pawn', 2, 2, 'white', { hp: 1 }]]);
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.pieces[0].hp).toBe(2);
  });

  it('shield absorbs one hit', () => {
    const g = setup('shield', [['pawn', 2, 2, 'white']]);
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.pieces[0].status.shield).toEqual({ charges: 1 });
    g.pieces[0].hp = 1;
    const black = g.addPiece('pawn', 1, 1, 'black');
    g.turn = 'black';
    g.setTempo('black', 1);
    g.applyAction({ type: 'MOVE', pieceId: black.id, col: 2, row: 2 });
    expect(g.pieces[0].hp).toBe(1);
    expect(g.pieces[0].status.shield).toBeUndefined();
  });

  it('fortress shields allies in 3x3', () => {
    const g = setup('fortress', [
      ['pawn', 4, 4, 'white'],
      ['rook', 5, 5, 'white'],
      ['pawn', 0, 0, 'white'],
    ]);
    expect(play(g, 4, 4).ok).toBe(true);
    expect(g.pieces[0].status.shield.charges).toBe(1);
    expect(g.pieces[1].status.shield.charges).toBe(1);
    expect(g.pieces[2].status.shield).toBeUndefined();
  });

  it('vampirism heals on attack', () => {
    const g = setup('vampirism', [
      ['pawn', 2, 2, 'white', { hp: 1 }],
      ['pawn', 1, 1, 'black'],
    ]);
    expect(play(g, 2, 2).ok).toBe(true);
    g.turn = 'white';
    g.setTempo('white', 1);
    g.applyAction({ type: 'MOVE', pieceId: g.pieces[0].id, col: 1, row: 1 });
    expect(g.pieces[0].hp).toBe(2);
  });

  it('thorns damages attacker', () => {
    const g = setup('thorns', [
      ['pawn', 2, 2, 'white'],
      ['pawn', 1, 1, 'black'],
    ]);
    expect(play(g, 2, 2).ok).toBe(true);
    g.turn = 'black';
    g.setTempo('black', 1);
    g.applyAction({ type: 'MOVE', pieceId: g.pieces[1].id, col: 2, row: 2 });
    expect(g.pieces[1].hp).toBe(g.pieces[1].maxHp - 1);
  });

  it('freeze stops a piece', () => {
    const g = setup('freeze', [['pawn', 2, 2, 'black']]);
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.pieces[0].status.frozen).toEqual({ turns: 1 });
    g.turn = 'black';
    g.setTempo('black', 1);
    const r = g.applyAction({ type: 'MOVE', pieceId: g.pieces[0].id, col: 2, row: 3 });
    expect(r.reason).toBe('frozen');
  });
});

describe('trap cards', () => {
  it('mine triggers damage when an enemy steps on it', () => {
    const g = setup('mine', [['pawn', 2, 1, 'black']]);
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.traps).toHaveLength(1);
    g.turn = 'black';
    g.setTempo('black', 1);
    g.applyAction({ type: 'MOVE', pieceId: g.pieces[0].id, col: 2, row: 2 });
    expect(g.traps).toHaveLength(0);
    expect(g.pieces).toHaveLength(0);
  });

  it('frost_trap freezes the enemy', () => {
    const g = setup('frost_trap', [['pawn', 2, 1, 'black']]);
    expect(play(g, 2, 2).ok).toBe(true);
    g.turn = 'black';
    g.setTempo('black', 1);
    g.applyAction({ type: 'MOVE', pieceId: g.pieces[0].id, col: 2, row: 2 });
    expect(g.pieces[0].status.frozen).toEqual({ turns: 2 });
    expect(g.traps).toHaveLength(0);
  });

  it('mine_field places three traps in enemy half', () => {
    const g = setup('mine_field');
    expect(play(g, 0, 0).ok).toBe(true);
    expect(g.traps).toHaveLength(3);
    expect(g.traps.every((t) => t.row <= 3 && t.kind === 'mine')).toBe(true);
  });

  it('sapper removes enemy trap and draws a card', () => {
    const g = setup('sapper', [], 7, { white: [{ uid: 'extra', cardId: 'spark' }] });
    g.traps.push({ id: 'e1', col: 2, row: 2, owner: 'black', kind: 'mine', params: {}, revealedTo: ['black'] });
    const before = g.cards.hands.white.length;
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.traps).toHaveLength(0);
    expect(g.cards.hands.white.length).toBe(before);
  });

  it('scout reveals enemy traps in 5x5', () => {
    const g = setup('scout');
    g.traps.push({ id: 'e1', col: 3, row: 3, owner: 'black', kind: 'mine', params: {}, revealedTo: ['black'] });
    g.traps.push({ id: 'e2', col: 7, row: 7, owner: 'black', kind: 'mine', params: {}, revealedTo: ['black'] });
    expect(play(g, 3, 3).ok).toBe(true);
    expect(g.traps[0].revealedTo).toContain('white');
    expect(g.traps[1].revealedTo).not.toContain('white');
  });
});

describe('piece manipulation cards', () => {
  it('summon_pawn creates an exhausted pawn', () => {
    const g = setup('summon_pawn');
    expect(play(g, 2, 7).ok).toBe(true);
    expect(g.pieces).toHaveLength(1);
    expect(g.pieces[0].type).toBe('pawn');
    expect(g.turnMove).toContain(g.pieces[0].id);
  });

  it('ghost_rook has reduced hp and expire status', () => {
    const g = setup('ghost_rook');
    expect(play(g, 2, 7).ok).toBe(true);
    expect(g.pieces[0].hp).toBe(3);
    expect(g.pieces[0].status.expire).toEqual({ turns: 3 });
  });

  it('resurrect revives from own graveyard at half hp', () => {
    const g = setup('resurrect');
    g.graveyard.white.push({ type: 'knight', color: 'white', id: 50 });
    expect(play(g, 2, 5).ok).toBe(true);
    expect(g.pieces[0]).toMatchObject({ type: 'knight', hp: 2, maxHp: 3, color: 'white' });
    expect(g.graveyard.white).toHaveLength(0);
  });

  it('necromancy revives enemy piece as own', () => {
    const g = setup('necromancy');
    g.graveyard.black.push({ type: 'bishop', color: 'black', id: 51 });
    expect(play(g, 2, 5).ok).toBe(true);
    expect(g.pieces[0]).toMatchObject({ type: 'bishop', hp: 2, color: 'white' });
  });

  it('swap_king swaps ally with king', () => {
    const g = setup('swap_king', [
      ['king', 3, 7, 'white'],
      ['pawn', 2, 5, 'white'],
    ]);
    const [king, pawn] = g.pieces;
    expect(play(g, 2, 5).ok).toBe(true);
    expect([king.col, king.row]).toEqual([2, 5]);
    expect([pawn.col, pawn.row]).toEqual([3, 7]);
  });

  it('blink teleports an ally', () => {
    const g = setup('blink', [['pawn', 2, 5, 'white']]);
    const p = g.pieces[0];
    const before = [p.col, p.row];
    expect(play(g, 2, 5).ok).toBe(true);
    expect([p.col, p.row]).not.toEqual(before);
  });

  it('shockwave pushes an adjacent piece', () => {
    const g = setup('shockwave', [['pawn', 3, 4, 'black']]);
    expect(play(g, 4, 4).ok).toBe(true);
    expect([g.pieces[0].col, g.pieces[0].row]).toEqual([2, 4]);
  });

  it('second_wind grants another action', () => {
    const g = setup('second_wind', [['pawn', 2, 2, 'white']]);
    g.turnMove.push(g.pieces[0].id);
    g.movedThisTurn = true;
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.turnMove).not.toContain(g.pieces[0].id);
    expect(g.movedThisTurn).toBe(false);
  });

  it('knighting and coronation transform a pawn', () => {
    const g1 = setup('knighting', [['pawn', 2, 2, 'white']]);
    expect(play(g1, 2, 2).ok).toBe(true);
    expect(g1.pieces[0].type).toBe('knight');

    const g2 = setup('coronation', [['pawn', 2, 2, 'white']]);
    expect(play(g2, 2, 2).ok).toBe(true);
    expect(g2.pieces[0].type).toBe('queen');
  });

  it('mind_control changes owner and exhausts piece', () => {
    const g = setup('mind_control', [['pawn', 2, 1, 'black']]);
    expect(play(g, 2, 1).ok).toBe(true);
    expect(g.pieces[0].color).toBe('white');
    expect(g.turnMove).toContain(g.pieces[0].id);
  });
});

describe('card / tempo cards', () => {
  it('insight draws two cards', () => {
    const g = setup('insight', [], 7, { white: [{ uid: 'e1', cardId: 'spark' }] });
    const before = g.cards.hands.white.length;
    expect(play(g, 0, 0).ok).toBe(true);
    expect(g.cards.hands.white.length).toBe(before + 1);
  });

  it('steal takes a card from opponent', () => {
    const g = setup('steal', [], 7, { black: [{ uid: 'enemy1', cardId: 'spark' }] });
    expect(play(g, 0, 0).ok).toBe(true);
    expect(g.cards.hands.black).toHaveLength(0);
    expect(g.cards.hands.white).toHaveLength(1);
  });

  it('jam lowers opponent tempo next turn', () => {
    const g = setup('jam');
    expect(play(g, 0, 0).ok).toBe(true);
    expect(g.tempoMod.black).toBe(-1);
    g.turn = 'white';
    g.endTurn();
    expect(g.getTempo('black')).toBe(Math.max(1, g.maxTempo - 1));
    expect(g.tempoMod.black).toBe(0);
  });

  it('adrenaline discards and grants tempo', () => {
    const g = setup('adrenaline', [], 3, { white: [{ uid: 'e1', cardId: 'spark' }] });
    const before = g.getTempo('white');
    expect(play(g, 0, 0).ok).toBe(true);
    expect(g.getTempo('white')).toBe(before + 2);
  });

  it('sacrifice kills pawn then draws and gives tempo', () => {
    const g = setup('sacrifice', [['pawn', 2, 2, 'white']], 3, { white: [{ uid: 'e1', cardId: 'spark' }] });
    const beforeTempo = g.getTempo('white');
    const beforeHand = g.cards.hands.white.length;
    expect(play(g, 2, 2).ok).toBe(true);
    expect(g.pieces).toHaveLength(0);
    expect(g.cards.hands.white.length).toBe(beforeHand + 1);
    expect(g.getTempo('white')).toBe(beforeTempo + 1);
  });
});

describe('game over', () => {
  it('attack that kills a king ends the game and blocks actions', () => {
    const g = setup('spark', [
      ['queen', 4, 4, 'white'],
      ['king', 4, 3, 'black', { hp: 1 }],
    ]);
    const result = g.applyAction({ type: 'MOVE', pieceId: g.pieces[0].id, col: 4, row: 3 });
    expect(result.result).toBe('kill');
    expect(g.gameOver).toEqual({ loser: 'black', winner: 'white' });
    expect(result.events.some((e) => e.type === 'game_over')).toBe(true);
    expect(g.applyAction({ type: 'END_TURN' }).reason).toBe('game-over');
  });
});
