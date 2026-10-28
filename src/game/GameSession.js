import { Game } from './Game.js';
import { LocalTransport } from './transport/LocalTransport.js';

export class GameSession {
  constructor(game = new Game(), transport = new LocalTransport()) {
    this.game = game;
    this.transport = transport;
    this.seq = 0;
    this.listeners = new Set();

    this.transport.onReceive?.((resolved) => {
      this.applyResolved(resolved);
    });
  }

  dispatch(action) {
    const result = this.game.applyAction(action);

    if (!result?.ok) {
      return {
        ok: false,
        action,
        result: result?.result ?? null,
        reason: result?.reason ?? 'unknown-error',
        events: result?.events ?? [],
        state: this.game.toState(),
        seq: this.seq,
      };
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

    this.listeners.forEach((listener) => listener(resolved));
    this.transport.send?.(resolved);

    return resolved;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toState() {
    return this.game.toState();
  }

  applyResolved(resolved) {
    // Used by remote transports. For local mode this is a no-op because
    // dispatch already mutates the shared Game instance.
    this.seq = Math.max(this.seq, resolved?.seq ?? this.seq);
    this.listeners.forEach((listener) => listener(resolved));
  }
}