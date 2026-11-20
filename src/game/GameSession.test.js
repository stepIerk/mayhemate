import { describe, it, expect } from 'vitest';
import { Game } from './Game.js';
import { GameSession } from './GameSession.js';
import { endTurnAction, moveAction } from './actions.js';

class FakeTransport {
  constructor() {
    this.peer = null;
    this.messageHandlers = new Set();
    this.statusHandlers = new Set();
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  send(message) {
    this.peer?.receive(message);
    return true;
  }

  receive(message) {
    this.messageHandlers.forEach((handler) => handler(message));
  }

  close() {}
}

function createTransportPair() {
  const hostTransport = new FakeTransport();
  const guestTransport = new FakeTransport();

  hostTransport.peer = guestTransport;
  guestTransport.peer = hostTransport;

  return { hostTransport, guestTransport };
}

function createSessions() {
  const { hostTransport, guestTransport } = createTransportPair();

  const host = new GameSession({
    role: 'host',
    transport: hostTransport,
    localColor: 'white',
    remoteColor: 'black',
  });

  const guest = new GameSession({
    game: Game.fromState(host.toState()),
    role: 'guest',
    transport: guestTransport,
    localColor: 'black',
    seq: 0,
  });

  return { host, guest };
}

describe('GameSession online flow', () => {
  it('syncs host moves to the guest', () => {
    const { host, guest } = createSessions();
    const pawn = host.game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'white'
    );

    const result = host.dispatch(moveAction(pawn.id, pawn.col, pawn.row - 1));

    expect(result.ok).toBe(true);
    expect(guest.seq).toBe(1);
    expect(guest.game.getPieceById(pawn.id).row).toBe(5);
    expect(guest.game.turn).toBe('white');
  });

  it('rejects guest actions during the host turn', () => {
    const { host, guest } = createSessions();
    const blackPawn = guest.game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'black'
    );

    const result = guest.dispatch(
      moveAction(blackPawn.id, blackPawn.col, blackPawn.row + 1)
    );

    expect(result.ok).toBe(true);
    expect(result.pending).toBe(true);
    expect(guest.seq).toBe(0);
    expect(guest.game.getPieceById(blackPawn.id).row).toBe(1);
    expect(host.game.getPieceById(blackPawn.id).row).toBe(1);
  });

  it('lets the guest act after the host ends the turn', () => {
    const { host, guest } = createSessions();
    const blackPawn = guest.game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'black'
    );

    host.dispatch(endTurnAction());

    expect(guest.game.turn).toBe('black');

    const result = guest.dispatch(
      moveAction(blackPawn.id, blackPawn.col, blackPawn.row + 1)
    );

    expect(result.pending).toBe(true);
    expect(guest.seq).toBe(2);
    expect(guest.game.getPieceById(blackPawn.id).row).toBe(2);
    expect(host.game.getPieceById(blackPawn.id).row).toBe(2);
  });

  it('does not let the guest move host pieces', () => {
    const { host, guest } = createSessions();
    const whitePawn = guest.game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'white'
    );

    guest.dispatch(moveAction(whitePawn.id, whitePawn.col, whitePawn.row - 1));

    expect(guest.seq).toBe(0);
    expect(host.game.getPieceById(whitePawn.id).row).toBe(6);
  });

  it('reports guest actions as not connected without a transport', () => {
    const guest = new GameSession({ role: 'guest' });
    const blackPawn = guest.game.pieces.find(
      (piece) => piece.type === 'pawn' && piece.color === 'black'
    );

    const result = guest.dispatch(
      moveAction(blackPawn.id, blackPawn.col, blackPawn.row + 1)
    );

    expect(result.ok).toBe(false);
    expect(result.pending).toBe(false);
    expect(result.reason).toBe('not-connected');
  });
});
