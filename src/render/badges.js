import Phaser from 'phaser';

const SIZE = 14;
const CORNER_RADIUS = 3;
const BADGE_BORDER = 2;

// Рисует закруглённый квадрат попиксельно: 1 вызов fillRect = 1 «пиксель» текстуры.
function isInsideRoundedSquare(x, y, inset, radius) {
  const min = inset;
  const max = SIZE - 1 - inset;

  if (x < min || x > max || y < min || y > max) {
    return false;
  }

  const cornerX = Phaser.Math.Clamp(x, min + radius, max - radius);
  const cornerY = Phaser.Math.Clamp(y, min + radius, max - radius);
  const dx = x - cornerX;
  const dy = y - cornerY;

  return dx * dx + dy * dy <= radius * radius;
}

function createBadgeTexture(scene, key, fillColor) {
  if (scene.textures.exists(key)) {
    return;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0, add: false });

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (isInsideRoundedSquare(x, y, 0, CORNER_RADIUS)) {
        graphics.fillStyle(0x000000, 1);
        graphics.fillRect(x, y, 1, 1);
      }

      if (isInsideRoundedSquare(x, y, BADGE_BORDER, CORNER_RADIUS - BADGE_BORDER)) {
        graphics.fillStyle(fillColor, 1);
        graphics.fillRect(x, y, 1, 1);
      }
    }
  }

  graphics.generateTexture(key, SIZE, SIZE);
  graphics.destroy();
}

export const BADGE_SIZE = 24;

export function createBadgeTextures(scene) {
  createBadgeTexture(scene, 'badge_atk', 0xf2c94c);
  createBadgeTexture(scene, 'badge_hp', 0xd8584f);
}
