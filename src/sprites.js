// Bitmap font and pixel art, all defined in code.

// Each glyph is five columns of hex, lowest bit at the top.
const GLYPHS = {
  A: '7e1111117e', B: '7f49494936', C: '3e41414122', D: '7f4141221c', E: '7f49494941',
  F: '7f09090901', G: '3e4149497a', H: '7f0808087f', I: '00417f4100', J: '2040413f01',
  K: '7f08142241', L: '7f40404040', M: '7f020c027f', N: '7f0408107f', O: '3e4141413e',
  P: '7f09090906', Q: '3e4151215e', R: '7f09192946', S: '4649494931', T: '01017f0101',
  U: '3f4040403f', V: '1f2040201f', W: '3f4038403f', X: '6314081463', Y: '0708700807',
  Z: '6151494543', 0: '3e5149453e', 1: '00427f4000', 2: '4261514946', 3: '2141454b31',
  4: '1814127f10', 5: '2745454539', 6: '3c4a494930', 7: '0171090503', 8: '3649494936',
  9: '064949291e', ' ': '0000000000', '.': '0060600000', '!': '00005f0000', '?': '0201510906',
  '-': '0808080808', ':': '0036360000', '/': '2010080402', '+': '08083e0808', "'": '0005030000',
};

const CHAR_W = 6;
const CHAR_H = 7;

export function textWidth(str, scale = 1) {
  return (str.length * CHAR_W - 1) * scale;
}

export function drawText(ctx, str, x, y, color, { scale = 1, align = 'left', shadow } = {}) {
  const text = String(str).toUpperCase();
  if (shadow) drawText(ctx, text, x + scale, y + scale, shadow, { scale, align });
  let left = x;
  if (align === 'center') left = Math.round(x - textWidth(text, scale) / 2);
  if (align === 'right') left = x - textWidth(text, scale);
  ctx.fillStyle = color;
  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text[i]];
    if (!glyph) continue;
    for (let col = 0; col < 5; col++) {
      const bits = parseInt(glyph.slice(col * 2, col * 2 + 2), 16);
      for (let row = 0; row < CHAR_H; row++) {
        if (bits & (1 << row)) {
          ctx.fillRect(left + (i * CHAR_W + col) * scale, y + row * scale, scale, scale);
        }
      }
    }
  }
}

export const STAR = [
  '...1...',
  '...1...',
  '1111111',
  '.11111.',
  '..111..',
  '.11.11.',
  '.1...1.',
];

export const STAR_SMALL = [
  '..1..',
  '11111',
  '.111.',
  '.1.1.',
];

export const HEART = [
  '.11.11.',
  '1111111',
  '1111111',
  '.11111.',
  '..111..',
  '...1...',
];

export const TROPHY = [
  '..1111111..',
  '1.1122111.1',
  '1.1122111.1',
  '.111111111.',
  '...11111...',
  '....111....',
  '.....1.....',
  '.....1.....',
  '....111....',
  '...22222...',
];

export const LOCK = [
  '..111..',
  '.1...1.',
  '.1...1.',
  '1111111',
  '1112111',
  '1112111',
  '1111111',
];

export function drawSprite(ctx, rows, x, y, colors, scale = 1) {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') continue;
      ctx.fillStyle = colors[Number(row[c]) - 1];
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  });
}

// Player sprites seen from behind, as the camera sits above the back wall.
// 1 skin, 2 shirt, 3 shorts, 4 hair, 5 shoes. The racket is drawn separately so it can rotate.
const BODY = [
  '......444.....',
  '.....44444....',
  '.....44444....',
  '......111.....',
  '....222222....',
  '...22222222...',
  '..1122222211..',
  '..11.2222.11..',
  '..11.2222.11..',
  '..11.2222.1...',
  '.....2222.....',
];

const SWING_BODY = [
  '......444.....',
  '.....44444....',
  '.....44444....',
  '......111.11..',
  '....222221....',
  '...222222.....',
  '..112222......',
  '..11.2222.....',
  '..11.2222.....',
  '.....2222.....',
  '.....2222.....',
];

const LEGS_STILL = [
  '.....3333.....',
  '.....33333....',
  '.....33.33....',
  '.....33.33....',
  '.....11.11....',
  '.....11.11....',
  '.....11.11....',
  '.....11.11....',
  '.....11.11....',
  '.....55.55....',
  '....555.555...',
];

const LEGS_STRIDE = [
  '.....3333.....',
  '....333333....',
  '...333..33....',
  '...33....33...',
  '...11....11...',
  '..11.....11...',
  '..11......11..',
  '..11......11..',
  '.555......55..',
  '..........555.',
  '..............',
];

const LEGS_STRIDE_B = LEGS_STRIDE.map((row) => [...row].reverse().join(''));

export const PLAYER_FRAMES = {
  idle: [...BODY, ...LEGS_STILL],
  runA: [...BODY, ...LEGS_STRIDE],
  runB: [...BODY, ...LEGS_STRIDE_B],
  swing: [...SWING_BODY, ...LEGS_STRIDE],
};
export const PLAYER_SIZE = { w: 14, h: 22 };
// Where the hand sits in each kind of frame, in sprite pixels.
export const HAND = { rest: { x: 10.5, y: 9.5 }, swing: { x: 11.5, y: 3.5 } };
