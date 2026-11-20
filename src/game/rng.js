export function mulberry32(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextRandom(game) {
  game.rngState = (game.rngState + 0x6d2b79f5) >>> 0;
  let t = game.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(game, max) {
  if (!(max > 0)) {
    return 0;
  }
  return Math.floor(nextRandom(game) * max);
}

export function shuffleInPlace(game, list) {
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(game, index + 1);
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}
