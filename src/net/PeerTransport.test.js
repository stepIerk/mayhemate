import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { FakePeer, FakeConnection, peers } = vi.hoisted(() => {
  class FakeEmitter {
    constructor() {
      this.handlers = new Map();
    }

    on(event, handler) {
      const list = this.handlers.get(event) ?? [];
      list.push({ handler, once: false });
      this.handlers.set(event, list);
      return this;
    }

    once(event, handler) {
      const list = this.handlers.get(event) ?? [];
      list.push({ handler, once: true });
      this.handlers.set(event, list);
      return this;
    }

    off(event, handler) {
      const list = this.handlers.get(event) ?? [];
      this.handlers.set(
        event,
        list.filter((entry) => entry.handler !== handler)
      );
      return this;
    }

    emit(event, ...args) {
      const list = [...(this.handlers.get(event) ?? [])];

      for (const entry of list) {
        if (entry.once) {
          this.off(event, entry.handler);
        }
        entry.handler(...args);
      }

      return list.length > 0;
    }
  }

  class FakeConnection extends FakeEmitter {
    constructor({ metadata } = {}) {
      super();
      this.metadata = metadata;
      this.open = false;
      this.closed = false;
      this.sent = [];
    }

    openConnection() {
      if (this.closed || this.open) {
        return;
      }

      this.open = true;
      this.emit('open');
    }

    close() {
      if (this.closed) {
        return;
      }

      this.open = false;
      this.closed = true;
      this.emit('close');
    }

    send(message) {
      this.sent.push(message);
    }
  }

  class FakePeer extends FakeEmitter {
    static instances = [];

    constructor(idOrOptions, options) {
      super();
      this.id = typeof idOrOptions === 'string' ? idOrOptions : null;
      this.options = typeof idOrOptions === 'string' ? options : idOrOptions;
      this.destroyed = false;
      this.connectedTo = null;
      this.lastConnection = null;
      FakePeer.instances.push(this);
    }

    connect(peerId, options) {
      this.connectedTo = peerId;
      this.lastConnection = new FakeConnection({ metadata: options.metadata });
      return this.lastConnection;
    }

    destroy() {
      if (this.destroyed) {
        return;
      }

      this.destroyed = true;
      this.emit('close');
    }
  }

  return {
    FakePeer,
    FakeConnection,
    peers: FakePeer.instances,
  };
});

vi.mock('peerjs', () => ({ default: FakePeer }));

import { PeerTransport } from './PeerTransport.js';

function createTransport(role) {
  const transport = new PeerTransport({ role, debug: 0 });
  const statuses = [];
  transport.onStatus((status, detail) => statuses.push({ status, detail }));
  return { transport, statuses };
}

describe('PeerTransport', () => {
  beforeEach(() => {
    peers.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a room and reports the code', async () => {
    const { transport, statuses } = createTransport('host');
    const ready = transport.host();
    const peer = peers.at(-1);

    expect(peer.id).toMatch(/^mayhemate-[A-Z2-9]{5}$/);

    peer.emit('open');

    await expect(ready).resolves.toBe(transport.code);
    expect(statuses.some((entry) => entry.status === 'waiting')).toBe(true);
  });

  it('reuses a fixed room code after unavailable-id', async () => {
    vi.useFakeTimers();
    const { transport } = createTransport('host');
    const ready = transport.host(' ab-cd ');
    const first = peers.at(-1);

    expect(first.id).toBe('mayhemate-ABCD');

    first.emit('error', { type: 'unavailable-id' });

    expect(first.destroyed).toBe(true);

    vi.advanceTimersByTime(1000);

    const second = peers.at(-1);
    expect(second.id).toBe('mayhemate-ABCD');

    second.emit('open');

    await expect(ready).resolves.toBe('ABCD');
  });

  it('accepts a compatible guest and sends messages', async () => {
    const { transport, statuses } = createTransport('host');
    const ready = transport.host();
    const peer = peers.at(-1);
    peer.emit('open');
    await ready;

    const conn = new FakeConnection({ metadata: { v: 1 } });
    peer.emit('connection', conn);
    conn.openConnection();

    expect(statuses.some((entry) => entry.status === 'connected')).toBe(true);
    expect(transport.send({ t: 'welcome' })).toBe(true);
    expect(conn.sent).toContainEqual({ t: 'welcome' });
  });

  it('closes guests with an incompatible protocol version', async () => {
    const { transport, statuses } = createTransport('host');
    const ready = transport.host();
    const peer = peers.at(-1);
    peer.emit('open');
    await ready;

    const conn = new FakeConnection({ metadata: { v: 2 } });
    peer.emit('connection', conn);
    conn.openConnection();

    expect(conn.closed).toBe(true);
    expect(transport.conn).toBe(null);
    expect(
      statuses.some(
        (entry) =>
          entry.status === 'error' &&
          entry.detail?.message === 'protocol-version-mismatch'
      )
    ).toBe(true);
  });

  it('joins a room and receives messages', async () => {
    const { transport, statuses } = createTransport('guest');
    const joined = transport.join(' ab-cd ');
    const peer = peers.at(-1);

    peer.emit('open');

    expect(peer.connectedTo).toBe('mayhemate-ABCD');

    const conn = peer.lastConnection;
    conn.openConnection();

    await expect(joined).resolves.toBe(conn);
    expect(statuses.some((entry) => entry.status === 'connected')).toBe(true);

    const messages = [];
    transport.onMessage((message) => messages.push(message));
    conn.emit('data', { t: 'welcome', v: 1 });

    expect(messages).toContainEqual({ t: 'welcome', v: 1 });
  });

  it('closes on a bye message', async () => {
    const { transport, statuses } = createTransport('guest');
    const joined = transport.join('ABCDE');
    const peer = peers.at(-1);
    peer.emit('open');
    const conn = peer.lastConnection;
    conn.openConnection();
    await joined;

    conn.emit('data', { t: 'bye', v: 1, reason: 'room-full' });

    expect(conn.closed).toBe(true);
    expect(
      statuses.some(
        (entry) =>
          entry.status === 'closed' && entry.detail === 'room-full'
      )
    ).toBe(true);
  });

  it('sends bye and closes the peer', async () => {
    const { transport } = createTransport('guest');
    const joined = transport.join('ABCDE');
    const peer = peers.at(-1);
    peer.emit('open');
    const conn = peer.lastConnection;
    conn.openConnection();
    await joined;

    transport.close();

    expect(conn.sent).toContainEqual({ t: 'bye', v: 1 });
    expect(conn.closed).toBe(true);
    expect(peer.destroyed).toBe(true);
  });

  it('includes a close reason when provided', async () => {
    const { transport } = createTransport('guest');
    const joined = transport.join('ABCDE');
    const peer = peers.at(-1);
    peer.emit('open');
    const conn = peer.lastConnection;
    conn.openConnection();
    await joined;

    transport.close('left');

    expect(conn.sent).toContainEqual({ t: 'bye', v: 1, reason: 'left' });
  });

  it('times out when the signaling server does not open', async () => {
    vi.useFakeTimers();
    const { transport } = createTransport('host');
    const ready = transport.host();
    const peer = peers.at(-1);

    vi.advanceTimersByTime(20000);

    await expect(ready).rejects.toThrow('signaling-timeout');
    expect(peer.destroyed).toBe(true);
  });
});
