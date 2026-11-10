// The camera sits high above the back wall, looking down the court at the front wall.
// Walls stay vertical on screen, and everything shrinks with distance.

import { COURT, SWING_ANIM, SWING_WINDOW } from './physics.js';
import {
  HAND, PLAYER_FRAMES, PLAYER_SIZE, SHOULDER, drawSprite,
} from './sprites.js';

// The layout is designed for W x H. The canvas grows past that to match the
// screen's shape, with the design area centred inside it.
export const W = 180;
export const H = 360;
export const VIEW = { w: W, h: H, ox: 0, oy: 0 };

// Fit the canvas to a screen of the given shape. Returns true if it changed.
export function setViewAspect(aspect) {
  const w = aspect >= H / W ? W : Math.round(H / aspect);
  const h = aspect >= H / W ? Math.round(W * aspect) : H;
  if (w === VIEW.w && h === VIEW.h) return false;
  Object.assign(VIEW, { w, h, ox: Math.floor((w - W) / 2), oy: Math.floor((h - H) / 2) });
  courtCache.clear();
  return true;
}

// Fill the whole canvas, including the space around the design area.
export function fillView(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(-VIEW.ox, -VIEW.oy, VIEW.w, VIEW.h);
}

const CAMERA = { y: 17, z: 12 };
const FOCAL = 190;
const HORIZON = -52;
const PLAYER_HEIGHT = 1.8;
const WALL_TOP = 5.2;
// A little larger than life in metres, so the strings still read at this resolution.
const RACKET = {
  length: 0.8, headLength: 0.36, headWidth: 0.3, grip: 0.2,
};
// Racket-side poses seen from behind: hand in sprite pixels, racket angle in radians clockwise from up.
const POSE = {
  rest: { x: HAND.rest.x, y: HAND.rest.y, angle: 0.5 },
  ready: { x: 12, y: 3, angle: -0.35 },
  contact: { x: 13.5, y: 8, angle: 1.75 },
  through: { x: 9, y: 9, angle: 3.5 },
  finish: { x: 4.5, y: 4, angle: 5.4 },
};
const RAISE_TIME = 0.07;
// The stroke as fractions of SWING_ANIM: a quick whip to contact, a slower follow-through
// over the far shoulder, a short hold, then the racket comes back over the head to rest.
const STROKE = [
  [0, POSE.ready],
  [0.1, POSE.contact],
  [0.3, POSE.through],
  [0.5, POSE.finish],
  [0.72, POSE.finish],
  [1, { ...POSE.rest, angle: POSE.rest.angle + Math.PI * 2 }],
];
const ARM_WIDTH = 1.6;
const RACKET_POINTS = 20;
const STRING_GAP = 2;
const GRIP_COLOR = '#20202a';
const STRING_COLOR = '#f4f4f4';

export const THEMES_BY_ID = {
  club: {
    bg: '#17121f', floor: '#dcb077', floorAlt: '#d3a56a', front: '#e9e5da', side: '#cfcbc0', shade: '#bdb8ac',
    wall: '#5b4b7a', panel: '#2a2138', line: '#d63031', text: '#f4f1de', accent: '#ffd166', ball: '#14121c',
  },
  city: {
    bg: '#0c2536', floor: '#c9925a', floorAlt: '#bf8850', front: '#dff0f5', side: '#bcd7e0', shade: '#a6c3cd',
    wall: '#62b6cb', panel: '#1b4965', line: '#e0274d', text: '#f6fbff', accent: '#ffbf69', ball: '#10141c',
  },
  finals: {
    bg: '#0a0820', floor: '#3b3f8f', floorAlt: '#34387f', front: '#26225a', side: '#1d1a49', shade: '#17143c',
    wall: '#7a5cff', panel: '#15123a', line: '#ff5dcd', text: '#f2eeff', accent: '#3ddbd9', ball: '#ffffff',
  },
  mint: {
    bg: '#061a14', floor: '#14503b', floorAlt: '#114633', front: '#0e3226', side: '#0b2a20', shade: '#082118',
    wall: '#2fae7f', panel: '#0b2a20', line: '#7dffb8', text: '#c8ffe0', accent: '#7dffb8', ball: '#e8fff2',
  },
  tape: {
    bg: '#2a0f2e', floor: '#e08a4f', floorAlt: '#d67f45', front: '#7a2a5e', side: '#642250', shade: '#521b43',
    wall: '#f26b38', panel: '#4a1942', line: '#ffd23f', text: '#fff3e0', accent: '#ffd23f', ball: '#1c0e20',
  },
  midnight: {
    bg: '#05060b', floor: '#232b45', floorAlt: '#1e253c', front: '#121729', side: '#0e1220', shade: '#0a0d18',
    wall: '#3a4566', panel: '#0e1220', line: '#9fb3d9', text: '#e8eefc', accent: '#9fb3d9', ball: '#ffffff',
  },
};

export function project(x, y, z = 0) {
  const scale = FOCAL / (CAMERA.y - y);
  return {
    x: W / 2 + (x - COURT.width / 2) * scale,
    y: HORIZON + (CAMERA.z - z) * scale,
    scale,
  };
}

function polygon(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
}

// Lines are drawn pixel by pixel so they stay hard-edged, with no blur.
function line(ctx, a, b, color) {
  const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), 1, 1);
  }
}

function floorLine(ctx, x1, y1, x2, y2, color) {
  line(ctx, project(x1, y1), project(x2, y2), color);
}

// Follow the line through a and b out to the screen edge at x, stopping at maxY.
function toEdge(a, b, x, maxY) {
  const t = (x - a.x) / (b.x - a.x);
  const y = a.y + (b.y - a.y) * t;
  if (y <= maxY) return { x, y };
  const s = (maxY - a.y) / (b.y - a.y);
  return { x: a.x + (b.x - a.x) * s, y: maxY };
}

// On screens wider than the layout, carry a side wall and its red line out to the edge.
function extendSideWall(ctx, theme, wallX, edgeX) {
  const { length, frontLine, backLine } = COURT;
  const backY = project(wallX, length).y;
  const frontTop = project(wallX, 0, WALL_TOP);
  const top = toEdge(frontTop, project(wallX, length, WALL_TOP), edgeX, backY);
  polygon(ctx, [frontTop, top, { x: edgeX, y: backY }, project(wallX, length), project(wallX, 0)], theme.side);
  const redStart = project(wallX, 0, frontLine);
  line(ctx, redStart, toEdge(redStart, project(wallX, length, backLine), edgeX, backY), theme.line);
}

function paintCourt(ctx, theme) {
  const { width, length, frontLine, backLine, service, tin, shortLine, box } = COURT;
  ctx.translate(VIEW.ox, VIEW.oy);
  fillView(ctx, theme.bg);

  // Side walls run from the front corners out to the bottom of the screen.
  polygon(ctx, [project(0, 0, WALL_TOP), project(0, length, WALL_TOP), project(0, length, 0), project(0, 0, 0)], theme.side);
  polygon(ctx, [project(width, 0, WALL_TOP), project(width, length, WALL_TOP), project(width, length, 0), project(width, 0, 0)], theme.side);
  if (VIEW.ox > 0) {
    extendSideWall(ctx, theme, 0, -VIEW.ox);
    extendSideWall(ctx, theme, width, W + VIEW.ox);
  }
  polygon(ctx, [project(0, 0, WALL_TOP), project(width, 0, WALL_TOP), project(width, 0, 0), project(0, 0, 0)], theme.front);

  // Floor boards, narrowing toward the front wall.
  const boards = 12;
  for (let i = 0; i < boards; i++) {
    const left = (i * width) / boards;
    const right = ((i + 1) * width) / boards;
    polygon(ctx, [project(left, 0), project(right, 0), project(right, length), project(left, length)], i % 2 ? theme.floor : theme.floorAlt);
  }

  // Red court markings, placed from the real measurements.
  line(ctx, project(0, 0, frontLine), project(width, 0, frontLine), theme.line);
  line(ctx, project(0, 0, service), project(width, 0, service), theme.line);
  polygon(ctx, [project(0, 0, tin), project(width, 0, tin), project(width, 0, 0), project(0, 0, 0)], theme.shade);
  line(ctx, project(0, 0, tin), project(width, 0, tin), theme.line);
  line(ctx, project(0, 0, frontLine), project(0, length, backLine), theme.line);
  line(ctx, project(width, 0, frontLine), project(width, length, backLine), theme.line);

  floorLine(ctx, 0, shortLine, width, shortLine, theme.line);
  floorLine(ctx, width / 2, shortLine, width / 2, length, theme.line);
  floorLine(ctx, box, shortLine, box, shortLine + box, theme.line);
  floorLine(ctx, 0, shortLine + box, box, shortLine + box, theme.line);
  floorLine(ctx, width - box, shortLine, width - box, shortLine + box, theme.line);
  floorLine(ctx, width - box, shortLine + box, width, shortLine + box, theme.line);

  // The top of the back wall, right below the camera.
  const backLeft = project(0, length);
  const backRight = project(width, length);
  ctx.fillStyle = theme.shade;
  ctx.fillRect(-VIEW.ox, Math.round(backLeft.y), VIEW.w, 4);
  ctx.fillStyle = theme.side;
  ctx.fillRect(Math.round(backLeft.x), Math.round(backLeft.y), Math.round(backRight.x - backLeft.x), 1);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(-VIEW.ox, Math.round(backLeft.y) + 4, VIEW.w, VIEW.h);
}

const courtCache = new Map();

export function drawCourt(ctx, theme) {
  if (!courtCache.has(theme)) {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW.w;
    canvas.height = VIEW.h;
    paintCourt(canvas.getContext('2d'), theme);
    courtCache.set(theme, canvas);
  }
  ctx.drawImage(courtCache.get(theme), -VIEW.ox, -VIEW.oy);
}

const spriteCache = new Map();

function playerSprite(frame, kit) {
  const key = `${frame}|${kit.shirt}|${kit.shorts}|${kit.hair}`;
  if (!spriteCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = PLAYER_SIZE.w;
    canvas.height = PLAYER_SIZE.h;
    drawSprite(canvas.getContext('2d'), PLAYER_FRAMES[frame], 0, 0, [
      kit.skin ?? '#e0ac7e', kit.shirt, kit.shorts, kit.hair ?? '#3a2a20', '#f4f4f4', '#20202a',
    ]);
    spriteCache.set(key, canvas);
  }
  return spriteCache.get(key);
}

function frameFor(player) {
  if (player.anim > 0) return 'swing';
  let legs = 'idle';
  if (Math.hypot(player.mx, player.my) > 0.1) legs = Math.floor(player.run * 3.2) % 2 ? 'runA' : 'runB';
  if (player.window > 0) return `ready${legs[0].toUpperCase()}${legs.slice(1)}`;
  return legs;
}

const smooth = (t) => t * t * (3 - 2 * t);

function blend(a, b, t) {
  const k = smooth(Math.max(0, Math.min(1, t)));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: a.angle + (b.angle - a.angle) * k };
}

// Where the hand and racket are: resting, raised and waiting for the ball, or partway through a stroke.
function poseFor(player) {
  if (player.anim > 0) {
    const t = 1 - Math.min(1, player.anim / SWING_ANIM);
    const next = STROKE.findIndex(([at]) => at >= t);
    if (next <= 0) return STROKE[0][1];
    const [fromAt, from] = STROKE[next - 1];
    const [toAt, to] = STROKE[next];
    return blend(from, to, (t - fromAt) / (toAt - fromAt));
  }
  if (player.window > 0) return blend(POSE.rest, POSE.ready, (SWING_WINDOW - player.window) / RAISE_TIME);
  return POSE.rest;
}

function drawArm(ctx, from, to, size, color) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
}

function shadow(ctx, x, y, width, height) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(Math.round(x - width / 2), Math.round(y - height / 2), Math.round(width), Math.max(1, Math.round(height)));
}

// Angles are radians clockwise from straight up.
function drawRacket(ctx, hand, angle, scale, frame) {
  const along = { x: Math.sin(angle), y: -Math.cos(angle) };
  const at = (forward, across) => ({
    x: hand.x + (along.x * forward - along.y * across) * scale,
    y: hand.y + (along.y * forward + along.x * across) * scale,
  });
  const { length, headLength, headWidth, grip } = RACKET;
  const middle = length - headLength / 2;
  const halfLength = headLength / 2;
  const halfWidth = headWidth / 2;

  const strings = Math.max(1, Math.floor((headWidth * scale) / STRING_GAP));
  for (let i = 1; i < strings; i++) {
    const t = (i / strings) * 2 - 1;
    const cross = Math.sqrt(1 - t * t);
    line(ctx, at(middle - halfLength * cross, halfWidth * t), at(middle + halfLength * cross, halfWidth * t), STRING_COLOR);
    line(ctx, at(middle + halfLength * t, -halfWidth * cross), at(middle + halfLength * t, halfWidth * cross), STRING_COLOR);
  }
  line(ctx, at(grip, 0), at(length - headLength, 0), frame);
  line(ctx, at(0, 0), at(grip, 0), GRIP_COLOR);
  for (let i = 0; i < RACKET_POINTS; i++) {
    const point = (n) => {
      const turn = (n / RACKET_POINTS) * Math.PI * 2;
      return at(middle + Math.cos(turn) * halfLength, Math.sin(turn) * halfWidth);
    };
    line(ctx, point(i), point(i + 1), frame);
  }
}

export function drawPlayer(ctx, player, kit, marker) {
  const feet = project(player.x, player.y);
  const height = Math.round(PLAYER_HEIGHT * feet.scale);
  const width = Math.round((height * PLAYER_SIZE.w) / PLAYER_SIZE.h);
  shadow(ctx, feet.x, feet.y, width * 0.8, 3);
  if (marker) {
    ctx.fillStyle = marker;
    ctx.fillRect(Math.round(feet.x - width * 0.45), Math.round(feet.y) + 1, Math.round(width * 0.9), 1);
  }
  const left = Math.round(feet.x - width / 2);
  const top = Math.round(feet.y - height);
  const frame = frameFor(player);
  const sprite = playerSprite(frame, kit);
  const pose = poseFor(player);
  const toScreen = (p) => ({
    x: feet.x + player.facing * (p.x / PLAYER_SIZE.w - 0.5) * width,
    y: top + (p.y / PLAYER_SIZE.h) * height,
  });
  const hand = toScreen(pose);
  const pixel = width / PLAYER_SIZE.w;
  const drawArmAndRacket = () => {
    // Idle and running frames already have the arm in the sprite.
    if (frame.startsWith('ready') || frame === 'swing') {
      drawArm(ctx, toScreen(SHOULDER), hand, Math.max(1, Math.round(pixel * ARM_WIDTH)), kit.skin ?? '#e0ac7e');
    }
    drawRacket(ctx, hand, pose.angle * player.facing, feet.scale, kit.shirt);
  };
  // On the follow-through the arm crosses in front of the body, out of the camera's sight.
  const behind = pose.x < SHOULDER.x - 1;
  if (behind) drawArmAndRacket();
  ctx.save();
  if (player.facing < 0) {
    ctx.translate(left * 2 + width, 0);
    ctx.scale(-1, 1);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, left, top, width, height);
  ctx.restore();
  if (!behind) drawArmAndRacket();
}

export function drawBall(ctx, ball, trail, color) {
  const ground = project(ball.x, ball.y);
  const shadowSize = Math.max(2, ground.scale * 0.14);
  shadow(ctx, ground.x, ground.y, shadowSize + 1, 2);

  ctx.fillStyle = color;
  trail.forEach((point, i) => {
    ctx.globalAlpha = ((i + 1) / trail.length) * 0.3;
    const p = project(point.x, point.y, point.z);
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
  });
  ctx.globalAlpha = 1;
  const p = project(ball.x, ball.y, ball.z);
  const size = Math.max(4, Math.round(p.scale * 0.2));
  const x = Math.round(p.x - size / 2);
  const y = Math.round(p.y - size / 2);
  ctx.fillRect(x + 1, y, size - 2, size);
  ctx.fillRect(x, y + 1, size, size - 2);
}

export function drawLanding(ctx, landing, color, pulse) {
  const p = project(landing.x, landing.y);
  const size = Math.round(p.scale * (0.16 + pulse * 0.05));
  ctx.fillStyle = color;
  for (let i = -size; i <= size; i++) {
    ctx.fillRect(Math.round(p.x + i), Math.round(p.y + i * 0.45), 1, 1);
    ctx.fillRect(Math.round(p.x + i), Math.round(p.y - i * 0.45), 1, 1);
  }
}
