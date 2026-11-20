import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  loadSession,
  saveSession,
} from './sessionPersistence.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

describe('sessionPersistence', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: new MemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and restores an online session', () => {
    saveSession({
      role: 'host',
      code: 'ABCDE',
      localColor: 'white',
      seq: 2,
      toState: () => ({ pieces: [], turn: 'black' }),
    });

    expect(loadSession()).toEqual({
      v: 1,
      role: 'host',
      code: 'ABCDE',
      localColor: 'white',
      seq: 2,
      game: { pieces: [], turn: 'black' },
    });
  });

  it('does not save local sessions', () => {
    saveSession({
      role: 'local',
      code: null,
      localColor: null,
      seq: 0,
      toState: () => ({ pieces: [] }),
    });

    expect(loadSession()).toBe(null);
  });

  it('clears the saved session', () => {
    saveSession({
      role: 'guest',
      code: 'ABCDE',
      localColor: 'black',
      seq: 1,
      toState: () => ({ pieces: [] }),
    });

    clearSession();

    expect(loadSession()).toBe(null);
  });
});
