export const CARD_HAND_SIZE = 3;
export const MAX_HAND_SIZE = 6;

const DEFAULT_TEMPLATE = 'assets/cards/card_template.png';
const DEFAULT_BACK = 'assets/cards/card_back.png';

const COLORS = ['white', 'black'];

function createRng(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeSeed(seed) {
  return Number.isFinite(seed) ? seed >>> 0 : Math.floor(Math.random() * 0xffffffff);
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCard(entry, index) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const id =
    typeof entry.id === 'string' && entry.id.trim()
      ? entry.id.trim()
      : slugify(name) || `card-${index + 1}`;

  if (!name) {
    return null;
  }

  const cost = Number(entry.cost);
  const copies = Number(entry.copies);

  return {
    id,
    name,
    text: typeof entry.text === 'string' ? entry.text : '',
    cost: Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : 1,
    copies: Number.isFinite(copies) ? Math.max(1, Math.floor(copies)) : 1,
    art: typeof entry.art === 'string' ? entry.art.trim() : '',
    target: typeof entry.target === 'string' ? entry.target : 'cell',
    requires:
      entry.requires && typeof entry.requires === 'object'
        ? { ...entry.requires }
        : null,
    effects: Array.isArray(entry.effects) ? entry.effects : [],
  };
}

export function normalizeCardCatalog(raw) {
  const cards = [];
  const seen = new Set();

  for (const [index, entry] of (Array.isArray(raw?.cards) ? raw.cards : []).entries()) {
    const card = normalizeCard(entry, index);

    if (!card || seen.has(card.id)) {
      continue;
    }

    seen.add(card.id);
    cards.push(card);
  }

  return {
    template:
      typeof raw?.template === 'string' && raw.template.trim()
        ? raw.template.trim()
        : DEFAULT_TEMPLATE,
    back:
      typeof raw?.back === 'string' && raw.back.trim()
        ? raw.back.trim()
        : DEFAULT_BACK,
    cards,
  };
}

let activeCatalog = normalizeCardCatalog(null);

export function setCardCatalog(raw) {
  activeCatalog = normalizeCardCatalog(raw);
  return activeCatalog;
}

export function getCardCatalog() {
  return activeCatalog;
}

export function findCardDefinition(cardId) {
  return activeCatalog.cards.find((card) => card.id === cardId) ?? null;
}

function sanitizeCardList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .filter(
      (card) =>
        card &&
        typeof card.uid === 'string' &&
        typeof card.cardId === 'string'
    )
    .map((card) => ({ ...card }));
}

export class CardState {
  constructor({
    deck = [],
    hands = { white: [], black: [] },
    discard = [],
    seed = 0,
  } = {}) {
    this.seed = normalizeSeed(seed);
    this.deck = sanitizeCardList(deck);
    this.hands = {
      white: sanitizeCardList(hands?.white),
      black: sanitizeCardList(hands?.black),
    };
    this.discard = sanitizeCardList(discard);
  }

  static create(definitions = [], { seed, handSize = CARD_HAND_SIZE } = {}) {
    const resolvedSeed = normalizeSeed(seed);
    const rng = createRng(resolvedSeed);
    const deck = [];

    for (const definition of definitions) {
      for (let copy = 0; copy < definition.copies; copy += 1) {
        deck.push({
          uid: `${definition.id}#${copy}`,
          cardId: definition.id,
        });
      }
    }

    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }

    const state = new CardState({ deck, seed: resolvedSeed });

    for (let round = 0; round < handSize; round += 1) {
      for (const color of COLORS) {
        const card = state.deck.pop();

        if (!card) {
          return state;
        }

        state.hands[color].push(card);
      }
    }

    return state;
  }

  static fromState(raw, definitions = [], options = {}) {
    if (!raw || !Array.isArray(raw.deck) || !raw.hands) {
      return CardState.create(definitions, options);
    }

    return new CardState({
      deck: raw.deck,
      hands: raw.hands,
      discard: raw.discard,
      seed: raw.seed,
    });
  }

  draw(color, count = 1) {
    const hand = this.hands[color];

    if (!hand) {
      return [];
    }

    const room = Math.max(0, MAX_HAND_SIZE - hand.length);
    const amount = Math.min(count, room);
    const drawn = [];

    for (let index = 0; index < amount && this.deck.length > 0; index += 1) {
      drawn.push(this.deck.pop());
    }

    hand.push(...drawn);
    return drawn;
  }

  hasInHand(color, uid) {
    return Boolean(this.hands[color]?.some((card) => card.uid === uid));
  }

  play(color, uid, target = null) {
    const hand = this.hands[color];

    if (!hand) {
      return null;
    }

    const index = hand.findIndex((card) => card.uid === uid);

    if (index === -1) {
      return null;
    }

    const [card] = hand.splice(index, 1);
    const played = {
      ...card,
      by: color,
      target: target ? { col: target.col, row: target.row } : null,
    };

    this.discard.push(played);
    return played;
  }

  toState() {
    return {
      seed: this.seed,
      deck: this.deck.map((card) => ({ ...card })),
      hands: {
        white: this.hands.white.map((card) => ({ ...card })),
        black: this.hands.black.map((card) => ({ ...card })),
      },
      discard: this.discard.map((card) => ({ ...card })),
    };
  }
}
