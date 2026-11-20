import { describe, it, expect } from 'vitest';
import { computeFanLayout } from './cardFan.js';

const BASE = {
  width: 1280,
  height: 860,
  panelTop: 560,
};

describe('computeFanLayout', () => {
  it('returns no slots for an empty hand', () => {
    expect(computeFanLayout({ ...BASE, count: 0 }).slots).toEqual([]);
  });

  it('centers the middle card in an odd hand', () => {
    const layout = computeFanLayout({ ...BASE, count: 5 });
    const center = layout.slots[2];

    expect(center.x).toBeCloseTo(BASE.width / 2);
    expect(center.rotation).toBeCloseTo(0);
    expect(layout.slots).toHaveLength(5);
  });

  it('tilts the fan outward and keeps cards inside the hand area', () => {
    const layout = computeFanLayout({ ...BASE, count: 5 });

    expect(layout.slots[0].rotation).toBeLessThan(0);
    expect(layout.slots[4].rotation).toBeGreaterThan(0);
    expect(layout.totalWidth).toBeLessThanOrEqual(BASE.width - 224 + 0.001);

    for (const slot of layout.slots) {
      const lowestCorner =
        slot.y +
        (layout.cardWidth / 2) * Math.abs(Math.sin(slot.rotation));

      expect(lowestCorner).toBeLessThanOrEqual(
        BASE.height - 8 + 0.001
      );
    }
  });

  it('keeps the card scale within bounds', () => {
    const layout = computeFanLayout({
      ...BASE,
      count: 5,
      minScale: 0.55,
      maxScale: 0.95,
    });

    expect(layout.scale).toBeGreaterThanOrEqual(0.55);
    expect(layout.scale).toBeLessThanOrEqual(0.95);
  });

  it('shrinks cards when the hand is width-constrained', () => {
    const layout = computeFanLayout({
      width: 400,
      height: 800,
      panelTop: 480,
      sideReserve: 14,
      count: 5,
    });

    expect(layout.scale).toBeLessThan(1);
    expect(layout.totalWidth).toBeLessThanOrEqual(400 - 28 + 0.001);
  });
});
