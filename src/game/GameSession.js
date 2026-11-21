import { Game } from './Game.js';
import { ACTION_TYPES } from './actions.js';
import { PROTOCOL_VERSION } from '../net/protocol.js';

export class GameSession {
  constructor({
    game = new Game(),
    transport = null,
    role = 'local',
    localColor = null,
    remoteColor = null,
    seq = 0,
    code = null,
  } = {}) {
    this.game = game;
    this.transport = transport;
    this.role = role;
    this.localColor = localColor;
    this.remoteColor = remoteColor;
    this.seq = seq;
    this.code = code;
    this.listeners = new Set();
    this.statusListeners = new Set();

    if (this.transport) {
      this.unsubscribeMessage = this.transport.onMessage((message) =>
        this.handleMessage(message)
      );
      this.unsubscribeStatus = this.transport.onStatus((status, detail) =>
        this.emitStatus(status, detail)
      );
    }
  }

  dispatch(action) {
    if (this.role === 'guest') {
      const sent =
        this.transport?.send({
          t: 'action',
          v: PROTOCOL_VERSION,
          action,
        }) ?? false;

      return {
        ok: sent,
        pending: sent,
        action,
        reason: sent ? null : 'not-connected',
        events: [],
        state: this.game.toState(),
        seq: this.seq,
      };
    }

    return this.resolve(action);
  }

  resolve(action) {
    const result = this.game.applyAction(action);

    if (!result?.ok) {
      const rejected = {
        ok: false,
        action,
        reason: result?.reason ?? 'unknown-error',
        events: [],
        state: this.game.toState(),
        seq: this.seq,
      };

      this.emit(rejected);

      if (this.role === 'host') {
        this.transport?.send({
          t: 'rejected',
          v: PROTOCOL_VERSION,
          reason: rejected.reason,
          state: this.game.toState(this.remoteColor),
          seq: rejected.seq,
        });
      }

      return rejected;
    }

    this.seq += 1;

    const resolved = {
      ok: true,
      action,
      result: result.result,
      reason: null,
      events: result.events ?? [],
      state: this.game.toState(),
      seq: this.seq,
    };

    this.emit(resolved);

    if (this.role === 'host') {
      this.transport?.send({
        t: 'resolved',
        v: PROTOCOL_VERSION,
        ...resolved,
        state: this.game.toState(this.remoteColor),
      });
    }

    return resolved;
  }

  handleMessage(message) {
    if (!message || message.v !== PROTOCOL_VERSION) {
      return;
    }

    if (message.t === 'action' && this.role === 'host') {
      if (!this.canRemoteAct(message.action)) {
        this.transport?.send({
          t: 'rejected',
          v: PROTOCOL_VERSION,
          reason: 'not-your-turn',
          state: this.game.toState(this.remoteColor),
          seq: this.seq,
        });
        return;
      }

      this.resolve(message.action);
      return;
    }

    if (message.t === 'resolved' && this.role === 'guest') {
      this.receiveResolved(message);
      return;
    }

    if (message.t === 'rejected' && this.role === 'guest') {
      if (message.state) {
        this.game = Game.fromState(message.state);
        this.seq = message.seq ?? this.seq;
      }

      this.emit({
        ok: false,
        action: null,
        reason: message.reason,
        events: [],
        state: this.game.toState(),
        seq: this.seq,
      });
    }
  }

  canRemoteAct(action) {
    if (this.game.turn !== this.remoteColor) {
      return false;
    }

    if (action?.type === ACTION_TYPES.MOVE) {
      return this.game.getPieceById(action.pieceId)?.color === this.remoteColor;
    }

    if (action?.type === ACTION_TYPES.PLAY_CARD) {
      return this.game.hasCard(this.remoteColor, action.cardUid);
    }

    return action?.type === ACTION_TYPES.END_TURN;
  }

  receiveResolved(resolved) {
    if (!resolved?.ok || resolved.seq <= this.seq) {
      return;
    }

    this.game = Game.fromState(resolved.state);
    this.seq = resolved.seq;
    this.emit(resolved);
  }

  emit(resolved) {
    this.listeners.forEach((listener) => listener(resolved));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  emitStatus(status, detail) {
    this.statusListeners.forEach((listener) => listener(status, detail));
  }

  toState() {
    return this.game.toState();
  }

  dispose(reason = null) {
    this.unsubscribeMessage?.();
    this.unsubscribeStatus?.();
    this.listeners.clear();
    this.statusListeners.clear();
    this.transport?.close?.(reason);
  }
}
