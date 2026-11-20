import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  createRoomCode,
  normalizeRoomCode,
} from './protocol.js';

describe('room protocol', () => {
  it('creates short codes without ambiguous characters', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = createRoomCode();

      expect(code).toHaveLength(5);
      expect(code).toMatch(/^[A-Z2-9]+$/);
      expect(code).not.toMatch(/[IO10]/);
    }
  });

  it('normalizes user input', () => {
    expect(normalizeRoomCode(' ab-cd ')).toBe('ABCD');
    expect(normalizeRoomCode('abcde')).toBe('ABCDE');
    expect(normalizeRoomCode('')).toBe('');
  });

  it('keeps the protocol version stable', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
