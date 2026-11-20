import { CARD_HEIGHT, CARD_WIDTH } from './cardLayout.js';

const MAX_TILT_DEGREES = 14;
const TILT_PER_CARD_DEGREES = 5;
const ARC_HEIGHT = 10;

export function computeFanLayout({
  count,
  width,
  height,
  panelTop,
  topPadding = 56,
  bottomPadding = 8,
  sideReserve = 112,
  maxScale = 1,
  minScale = 0.5,
} = {}) {
  if (!count || count <= 0) {
    return {
      scale: 1,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      totalWidth: 0,
      maxTilt: 0,
      slots: [],
    };
  }

  const availableHeight = Math.max(
    80,
    height - panelTop - topPadding - bottomPadding
  );
  const availableWidth = Math.max(
    0,
    Math.min(width - sideReserve * 2, width * 0.82)
  );
  const heightScale = availableHeight / CARD_HEIGHT;
  const widthScale =
    availableWidth / (CARD_WIDTH * (1 + 0.64 * Math.max(0, count - 1)));
  const scale = Math.min(
    maxScale,
    Math.max(minScale, Math.min(heightScale, widthScale))
  );
  const cardWidth = CARD_WIDTH * scale;
  const cardHeight = CARD_HEIGHT * scale;
  const maxSpan = Math.max(cardWidth, availableWidth);
  const preferredSpacing = cardWidth * 0.64;
  const spacingLimit =
    count > 1 ? (maxSpan - cardWidth) / (count - 1) : 0;
  const spacing =
    count > 1
      ? Math.max(
          cardWidth * 0.24,
          Math.min(preferredSpacing, spacingLimit)
        )
      : 0;
  const totalWidth = cardWidth + spacing * Math.max(0, count - 1);
  const centerX = width / 2;
  const bottom = height - bottomPadding;
  const maxTilt =
    (Math.min(
      MAX_TILT_DEGREES,
      (count - 1) * TILT_PER_CARD_DEGREES
    ) *
      Math.PI) /
    180;
  const slots = [];

  for (let index = 0; index < count; index += 1) {
    const offset = index - (count - 1) / 2;
    const t = count > 1 ? offset / ((count - 1) / 2) : 0;
    const rotation = t * maxTilt;
    const cornerLift =
      (cardWidth / 2) * Math.abs(Math.sin(rotation));

    slots.push({
      x: centerX + offset * spacing,
      y: bottom - (1 - t * t) * ARC_HEIGHT - cornerLift,
      rotation,
      scale,
      t,
    });
  }

  return {
    scale,
    cardWidth,
    cardHeight,
    totalWidth,
    maxTilt,
    slots,
  };
}
