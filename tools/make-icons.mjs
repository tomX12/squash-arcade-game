// Writes the home screen icons as PNGs from a small pixel design.

import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const PALETTE = {
  '.': [23, 18, 31],
  f: [222, 176, 112],
  w: [232, 228, 218],
  s: [200, 196, 188],
  r: [214, 48, 49],
  k: [30, 30, 40],
  p: [255, 90, 54],
};

const DESIGN = [
  '................',
  '....wwwwwwww....',
  '....rrrrrrrr....',
  '...swwwwwwwws...',
  '...srrrrrrrrs...',
  '..sswwwwwwwwss..',
  '..sffffkkffffs..',
  '.ssffffkkffffss.',
  '.sfffffffffffss.',
  '.sffffppfffffss.',
  'ssffffppfffffss.',
  'srrrrrrrrrrrrrrs',
  'sfffffffrffffffs',
  'sfffffffrffffffs',
  'srrrrrrrrrrrrrrs',
  '................',
];

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let at = 0;
  for (let y = 0; y < size; y++) {
    raw[at++] = 0;
    for (let x = 0; x < size; x++) {
      const ch = DESIGN[Math.floor((y * DESIGN.length) / size)][Math.floor((x * DESIGN.length) / size)];
      for (const value of PALETTE[ch]) raw[at++] = value;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8-bit
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of [180, 192, 512]) writeFileSync(`icons/icon-${size}.png`, png(size));
