import Peer from 'peerjs';
import {
  PROTOCOL_VERSION,
  ROOM_PREFIX,
  createRoomCode,
  normalizeRoomCode,
} from './protocol.js';

const CONNECTION_TIMEOUT = 20000;

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const PUBLIC_TURN_SERVERS = [
  {
    urls: [
      'turn:188.40.107.24:3478?transport=udp',
      'turn:188.40.107.24:3478?transport=tcp',
    ],
    username: 'M9DRVaByiujoXeuYAAAG',
    credential: 'TpHR9HQNZ8taxjb3',
  },
  {
    urls: [
      'turn:146.190.244.213:3478?transport=udp',
      'turn:146.190.244.213:3478?transport=tcp',
    ],
    username: 'quickblox',
    credential: 'baccb97ba2d92d71e26eb9886da5f1e0',
  },
  {
    urls: 'turn:158.69.27.176:4589?transport=udp',
    username: 'anonymous',
    credential: 'anonymous',
  },
];

const env = import.meta.env ?? {};
const turnUrls = String(env.VITE_TURN_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const turnUsername = env.VITE_TURN_USERNAME ?? '';
const turnCredential = env.VITE_TURN_CREDENTIAL ?? '';

const ICE_SERVERS = [
  ...STUN_SERVERS,
  ...(turnUrls.length && turnUsername && turnCredential
    ? [{ urls: turnUrls, username: turnUsername, credential: turnCredential }]
    : []),
  ...PUBLIC_TURN_SERVERS,
];

export class PeerTransport {
  constructor({ role, debug = 1 } = {}) {
    this.role = role;
    this.debug = debug;
    this.peer = null;
    this.conn = null;
    this.code = null;
    this.closed = false;
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

  emitMessage(data) {
    this.messageHandlers.forEach((handler) => handler(data));
  }

  emitStatus(status, detail) {
    this.statusHandlers.forEach((handler) => handler(status, detail));
  }

  host(code = null) {
    const fixedCode = code ? normalizeRoomCode(code) : null;

    if (this.closed) {
      return Promise.reject(new Error('closed'));
    }

    if (code && !fixedCode) {
      return Promise.reject(new Error('empty-room-code'));
    }

    return new Promise((resolve, reject) => {
      let attempts = 0;

      const create = () => {
        if (this.closed) {
          reject(new Error('closed'));
          return;
        }

        this.code = fixedCode ?? createRoomCode();
        const peer = new Peer(ROOM_PREFIX + this.code, {
          debug: this.debug,
          config: { iceServers: ICE_SERVERS },
        });
        this.peer = peer;
        let settled = false;

        const timeout = setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          peer.destroy();
          reject(new Error('signaling-timeout'));
        }, CONNECTION_TIMEOUT);

        const fail = (error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeout);
          peer.destroy();

          if (error.type === 'unavailable-id') {
            if (!fixedCode) {
              create();
              return;
            }

            attempts += 1;

            if (attempts > 8) {
              reject(error);
              return;
            }

            setTimeout(create, Math.min(1000 * attempts, 3000));
            return;
          }

          reject(error);
        };

        peer.once('open', () => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeout);
          peer.off('error', fail);
          this.attachPeer(peer);
          this.emitStatus('waiting', this.code);
          resolve(this.code);
        });

        peer.once('error', fail);
      };

      create();
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('closed'));
        return;
      }

      this.code = normalizeRoomCode(code);

      if (!this.code) {
        reject(new Error('empty-room-code'));
        return;
      }

      this.emitStatus('connecting', this.code);

      const peer = new Peer({
        debug: this.debug,
        config: { iceServers: ICE_SERVERS },
      });
      this.peer = peer;
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        peer.destroy();
        reject(new Error('signaling-timeout'));
      }, CONNECTION_TIMEOUT);

      const fail = (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        peer.destroy();
        reject(error);
      };

      peer.once('open', () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        peer.off('error', fail);
        this.attachPeer(peer);
        this.emitStatus('joining', this.code);

        try {
          const conn = peer.connect(ROOM_PREFIX + this.code, {
            reliable: true,
            serialization: 'json',
            metadata: { v: PROTOCOL_VERSION },
          });

          this.attachConnection(conn, resolve, reject);
        } catch (error) {
          this.emitStatus('error', error);
          reject(error);
        }
      });

      peer.once('error', fail);
    });
  }

  attachPeer(peer) {
    peer.on('connection', (conn) => {
      if (this.role !== 'host') {
        conn.close();
        return;
      }

      if (this.conn) {
        conn.on('open', () => {
          conn.send({ t: 'bye', v: PROTOCOL_VERSION, reason: 'room-full' });
          conn.close();
        });
        return;
      }

      this.attachConnection(conn);
    });

    peer.on('disconnected', () => this.emitStatus('disconnected'));
    peer.on('close', () => this.emitStatus('closed'));
    peer.on('error', (error) => this.emitStatus('error', error));
  }

  attachConnection(conn, resolve, reject) {
    this.conn = conn;
    let opened = false;

    const timeout = setTimeout(() => {
      if (this.conn === conn) {
        this.conn = null;
      }

      reject?.(new Error('connection-timeout'));
      conn.close();
    }, CONNECTION_TIMEOUT);

    conn.on('open', () => {
      clearTimeout(timeout);
      opened = true;

      if (this.role === 'host' && conn.metadata?.v !== PROTOCOL_VERSION) {
        opened = false;

        if (this.conn === conn) {
          this.conn = null;
        }

        this.emitStatus('error', new Error('protocol-version-mismatch'));
        conn.close();
        return;
      }

      this.emitStatus('connected');
      resolve?.(conn);
    });

    conn.on('data', (data) => {
      if (data?.t === 'bye') {
        this.emitStatus('closed', data.reason);
        conn.close();
        return;
      }

      this.emitMessage(data);
    });

    conn.on('close', () => {
      clearTimeout(timeout);

      if (this.conn === conn) {
        this.conn = null;
      }

      if (opened) {
        this.emitStatus('disconnected');
      }
    });

    conn.on('error', (error) => {
      clearTimeout(timeout);

      if (this.conn === conn) {
        this.conn = null;
      }

      if (opened) {
        this.emitStatus('error', error);
      }

      reject?.(error);
    });
  }

  send(message) {
    if (!this.conn?.open) {
      return false;
    }

    try {
      this.conn.send(message);
      return true;
    } catch (error) {
      this.emitStatus('error', error);
      this.conn?.close?.();
      return false;
    }
  }

  close(reason = null) {
    if (this.closed) {
      return;
    }

    this.closed = true;

    const message = { t: 'bye', v: PROTOCOL_VERSION };

    if (reason) {
      message.reason = reason;
    }

    this.send(message);
    this.conn?.close();
    this.conn = null;
    this.peer?.destroy();
    this.peer = null;
    this.emitStatus('closed', reason ?? undefined);
  }
}
