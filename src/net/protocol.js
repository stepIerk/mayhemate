export const PROTOCOL_VERSION = 1;
export const ROOM_PREFIX = 'mayhemate-';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoomCode(length = 5) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_ALPHABET[values[i] % ROOM_ALPHABET.length];
  }

  return code;
}

export function normalizeRoomCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
