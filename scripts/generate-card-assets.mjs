import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARD_HEIGHT,
  CARD_LAYOUT,
  CARD_WIDTH,
} from '../src/render/cardLayout.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/assets/cards');

const COLORS = {
  dark: [36, 20, 12, 255],
  deep: [20, 11, 7, 255],
  bronze: [138, 79, 29, 255],
  bronzeLight: [201, 138, 60, 255],
  gold: [255, 209, 79, 255],
  parchment: [239, 224, 191, 255],
  parchmentMid: [229, 210, 172, 255],
  parchmentDark: [206, 182, 142, 255],
  parchmentLight: [249, 236, 207, 255],
  artBg: [27, 30, 39, 255],
  artDark: [17, 19, 26, 255],
  artLine: [42, 47, 60, 255],
  backInterior: [25, 27, 35, 255],
  backTile: [31, 34, 44, 255],
};

const CRC_TABLE = (() => {
  const table = new Int32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value;
  }

  return table;
})();

function crc32(buffer) {
  let crc = -1;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createCanvas(width, height) {
  return {
    width,
    height,
    pixels: Buffer.alloc(width * height * 4),
  };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }

  const index = (y * canvas.width + x) * 4;
  canvas.pixels[index] = color[0];
  canvas.pixels[index + 1] = color[1];
  canvas.pixels[index + 2] = color[2];
  canvas.pixels[index + 3] = color[3] ?? 255;
}

function fillRect(canvas, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      setPixel(canvas, px, py, color);
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fillRoundedRect(canvas, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const cornerX = clamp(px, x + radius, x + width - 1 - radius);
      const cornerY = clamp(py, y + radius, y + height - 1 - radius);
      const dx = px - cornerX;
      const dy = py - cornerY;

      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(canvas, px, py, color);
      }
    }
  }
}

function drawLine(canvas, x0, y0, x1, y1, color, thickness = 1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  let error = dx - dy;
  let x = x0;
  let y = y0;

  while (true) {
    fillRect(
      canvas,
      x - Math.floor(thickness / 2),
      y - Math.floor(thickness / 2),
      thickness,
      thickness,
      color
    );

    if (x === x1 && y === y1) {
      break;
    }

    const doubled = error * 2;

    if (doubled > -dy) {
      error -= dy;
      x += stepX;
    }

    if (doubled < dx) {
      error += dx;
      y += stepY;
    }
  }
}

function drawDiamond(canvas, centerX, centerY, radius, outer, inner) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > radius) {
        continue;
      }

      setPixel(
        canvas,
        centerX + dx,
        centerY + dy,
        Math.abs(dx) + Math.abs(dy) <= radius - 2 ? inner : outer
      );
    }
  }
}

function drawFrame(canvas, interior) {
  fillRoundedRect(canvas, 0, 0, CARD_WIDTH, CARD_HEIGHT, 7, COLORS.dark);
  fillRoundedRect(canvas, 2, 2, CARD_WIDTH - 4, CARD_HEIGHT - 4, 6, COLORS.bronze);
  fillRoundedRect(
    canvas,
    4,
    4,
    CARD_WIDTH - 8,
    CARD_HEIGHT - 8,
    5,
    COLORS.bronzeLight
  );
  fillRoundedRect(
    canvas,
    6,
    6,
    CARD_WIDTH - 12,
    CARD_HEIGHT - 12,
    4,
    COLORS.dark
  );
  fillRoundedRect(
    canvas,
    8,
    8,
    CARD_WIDTH - 16,
    CARD_HEIGHT - 16,
    3,
    interior
  );

  fillRect(canvas, 11, 8, CARD_WIDTH - 22, 1, COLORS.parchmentLight);
  fillRect(canvas, 8, 11, 1, CARD_HEIGHT - 22, COLORS.bronzeLight);
  fillRect(canvas, 11, CARD_HEIGHT - 9, CARD_WIDTH - 22, 1, COLORS.bronze);
}

function drawParchmentTexture(canvas) {
  for (let y = 10; y < CARD_HEIGHT - 10; y += 1) {
    for (let x = 10; x < CARD_WIDTH - 10; x += 1) {
      const noise = (x * 37 + y * 17 + x * y * 3) % 97;

      if (noise === 0) {
        setPixel(canvas, x, y, COLORS.parchmentMid);
      } else if (noise === 1) {
        setPixel(canvas, x, y, COLORS.parchmentDark);
      }
    }
  }
}

function drawRivets(canvas) {
  const points = [
    [CARD_WIDTH - 15, 13],
    [13, CARD_HEIGHT - 15],
    [CARD_WIDTH - 15, CARD_HEIGHT - 15],
  ];

  for (const [x, y] of points) {
    fillRect(canvas, x - 1, y - 1, 3, 3, COLORS.deep);
    fillRect(canvas, x, y, 1, 1, COLORS.gold);
  }
}

function drawCardTemplate() {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);

  drawFrame(canvas, COLORS.parchment);
  drawParchmentTexture(canvas);

  const art = CARD_LAYOUT.art;
  fillRoundedRect(
    canvas,
    art.x,
    art.y,
    art.width,
    art.height,
    4,
    COLORS.bronze
  );
  fillRoundedRect(
    canvas,
    art.x + 2,
    art.y + 2,
    art.width - 4,
    art.height - 4,
    3,
    COLORS.deep
  );
  fillRect(
    canvas,
    art.x + 4,
    art.y + 4,
    art.width - 8,
    art.height - 8,
    COLORS.artBg
  );
  fillRect(canvas, art.x + 4, art.y + 4, art.width - 8, 1, COLORS.artLine);
  fillRect(
    canvas,
    art.x + 4,
    art.y + art.height - 5,
    art.width - 8,
    1,
    COLORS.artDark
  );

  const cost = CARD_LAYOUT.cost;
  fillRoundedRect(
    canvas,
    cost.x,
    cost.y,
    cost.width,
    cost.height,
    5,
    COLORS.deep
  );
  fillRoundedRect(
    canvas,
    cost.x + 1,
    cost.y + 1,
    cost.width - 2,
    cost.height - 2,
    4,
    COLORS.bronze
  );
  fillRoundedRect(
    canvas,
    cost.x + 3,
    cost.y + 3,
    cost.width - 6,
    cost.height - 6,
    3,
    [44, 24, 12, 255]
  );
  fillRect(canvas, cost.x + 4, cost.y + 3, cost.width - 8, 1, COLORS.bronzeLight);

  const name = CARD_LAYOUT.name;
  fillRect(canvas, name.x, name.y - 2, name.width, 1, COLORS.bronze);
  fillRect(canvas, name.x, name.y + name.height + 1, name.width, 1, COLORS.parchmentDark);

  const description = CARD_LAYOUT.description;
  fillRect(
    canvas,
    description.x,
    description.y - 3,
    description.width,
    1,
    COLORS.parchmentDark
  );
  fillRect(
    canvas,
    description.x,
    description.y - 2,
    description.width,
    1,
    COLORS.parchmentLight
  );

  drawDiamond(canvas, CARD_WIDTH / 2, CARD_HEIGHT - 6, 4, COLORS.bronze, COLORS.gold);
  drawRivets(canvas);

  return canvas;
}

function drawCardBack() {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);

  drawFrame(canvas, COLORS.backInterior);

  for (let y = 10; y < CARD_HEIGHT - 10; y += 1) {
    for (let x = 10; x < CARD_WIDTH - 10; x += 1) {
      const tileX = Math.floor((x - 10) / 8);
      const tileY = Math.floor((y - 10) / 8);

      if ((tileX + tileY) % 2 === 0) {
        setPixel(canvas, x, y, COLORS.backTile);
      }
    }
  }

  fillRoundedRect(
    canvas,
    CARD_WIDTH / 2 - 34,
    48,
    68,
    124,
    8,
    COLORS.bronze
  );
  fillRoundedRect(
    canvas,
    CARD_WIDTH / 2 - 32,
    50,
    64,
    120,
    7,
    COLORS.deep
  );
  fillRoundedRect(
    canvas,
    CARD_WIDTH / 2 - 30,
    52,
    60,
    116,
    6,
    COLORS.artBg
  );

  const centerX = CARD_WIDTH / 2;
  fillRect(canvas, centerX - 20, 70, 40, 4, COLORS.gold);
  fillRect(canvas, centerX - 18, 70, 36, 1, COLORS.parchmentLight);
  fillRect(canvas, centerX - 20, 146, 40, 4, COLORS.gold);
  fillRect(canvas, centerX - 18, 149, 36, 1, COLORS.bronze);

  drawLine(canvas, centerX - 18, 76, centerX - 2, 106, COLORS.bronzeLight, 2);
  drawLine(canvas, centerX + 18, 76, centerX + 2, 106, COLORS.bronzeLight, 2);
  drawLine(canvas, centerX - 2, 114, centerX - 18, 144, COLORS.bronzeLight, 2);
  drawLine(canvas, centerX + 2, 114, centerX + 18, 144, COLORS.bronzeLight, 2);

  fillRect(canvas, centerX - 8, 108, 16, 4, COLORS.gold);
  fillRect(canvas, centerX - 5, 112, 10, 3, [229, 170, 61, 255]);
  drawDiamond(canvas, centerX, 112, 4, COLORS.gold, COLORS.parchmentLight);

  drawRivets(canvas);
  drawDiamond(canvas, CARD_WIDTH / 2, CARD_HEIGHT - 6, 4, COLORS.bronze, COLORS.gold);

  return canvas;
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, canvas] of [
  ['card_template.png', drawCardTemplate()],
  ['card_back.png', drawCardBack()],
]) {
  writeFileSync(
    resolve(OUT_DIR, name),
    encodePng(canvas.width, canvas.height, canvas.pixels)
  );
}

console.log(`Card assets written to ${OUT_DIR}`);
