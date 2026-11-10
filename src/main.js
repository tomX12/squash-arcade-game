// Game loop, screens and rewards.

import {
  BOT, STEP, SWING_ANIM, SWING_WINDOW, WIN_SCORE, YOU, createMatch, isTieBreak, serve, starsFor, step, swing,
} from './physics.js';
import { createBrain, updateBot } from './bot.js';
import { CLUBS, OPPONENTS } from './levels.js';
import {
  KITS, Progress, THEMES, TROPHIES, requirementText,
} from './progress.js';
import {
  THEMES_BY_ID, VIEW, W, drawBall, drawCourt, drawLanding, drawPlayer, fillView, setViewAspect,
} from './render.js';
import {
  LOCK, STAR, STAR_SMALL, TROPHY, drawSprite, drawText,
} from './sprites.js';
import { setMuted, sfx, unlockAudio } from './audio.js';
import { bindInput, keys } from './input.js';

// Opens every opponent, kit, court and trophy. Set to false to earn them through play.
const UNLOCK_ALL = true;
const TRAIL_LENGTH = 7;
const STAR_DELAY = 0.35;
const STICK_RADIUS = 16;
const AIM_THRESHOLD = 0.35;
const CONTROLS_TOP = 276;
const SHOT_BUTTONS = [
  { shot: 'drop', label: 'DROP', x: 94, y: CONTROLS_TOP, w: 39, h: 32 },
  { shot: 'lob', label: 'LOB', x: 137, y: CONTROLS_TOP, w: 39, h: 32 },
  { shot: 'drive', label: 'DRIVE', x: 94, y: CONTROLS_TOP + 36, w: 82, h: 42 },
];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

export const progress = new Progress(undefined, { unlockAll: UNLOCK_ALL });
setMuted(progress.data.muted);

export const state = {
  screen: 'title', // title | select | gallery | play | pause | result | gameover
  match: null,
  brain: null,
  levelIndex: 0,
  clock: 0,
  accumulator: 0,
  trail: [],
  stick: null,
  pressedShot: null,
  banner: null,
  result: null,
  info: '',
};

let buttons = [];

function theme() {
  const chosen = progress.data.theme;
  if (chosen !== 'auto') return THEMES_BY_ID[chosen];
  return THEMES_BY_ID[CLUBS[OPPONENTS[state.levelIndex].club].theme];
}

function yourKit() {
  const kit = KITS.find((k) => k.id === progress.data.kit) ?? KITS[0];
  return { ...kit, hair: '#2b1d14' };
}

export function startMatch(i) {
  state.levelIndex = i;
  state.match = createMatch(OPPONENTS[i]);
  state.brain = createBrain();
  state.screen = 'play';
  state.accumulator = 0;
  state.trail = [];
  state.stick = null;
  state.banner = null;
}

function finishMatch() {
  state.banner = null;
  const { match, levelIndex } = state;
  if (match.winner !== YOU) {
    sfx.over();
    state.screen = 'gameover';
    return;
  }
  const stars = starsFor(match);
  const margin = match.score[YOU] - match.score[BOT];
  const previousBest = progress.best(levelIndex);
  const unlocks = progress.recordClear(levelIndex, stars, margin);
  state.result = {
    stars, margin, newBest: margin > previousBest, unlocks, time: 0, shown: 0,
  };
  state.screen = 'result';
  sfx.clear();
  if (unlocks.length) sfx.unlock();
}

function handleEvents(match) {
  for (const event of match.events) {
    switch (event.type) {
      case 'hit': sfx.hit(event.rally); break;
      case 'front': sfx.front(); break;
      case 'wall': sfx.wall(); break;
      case 'floor': sfx.floor(); break;
      case 'point': {
        const won = event.winner === YOU;
        if (isTieBreak(match)) sfx.tieBreak();
        else if (won) sfx.won();
        else sfx.lost();
        state.banner = { text: won ? 'YOUR POINT' : `${match.opponent.name}'S POINT`, detail: event.reason, won };
        break;
      }
      case 'over': finishMatch(); break;
      default:
    }
  }
  match.events.length = 0;
}

function applyControls(match) {
  const you = match.players[YOU];
  let mx = Number(keys.right) - Number(keys.left);
  let my = Number(keys.down) - Number(keys.up);
  if (state.stick) {
    mx = (state.stick.x - state.stick.ox) / STICK_RADIUS;
    my = (state.stick.y - state.stick.oy) / STICK_RADIUS;
  }
  you.mx = Math.max(-1, Math.min(1, mx));
  you.my = Math.max(-1, Math.min(1, my));
  you.aim = Math.abs(you.mx) > AIM_THRESHOLD ? Math.sign(you.mx) : 0;
}

function updatePlay(dt) {
  const { match } = state;
  applyControls(match);
  state.accumulator += dt;
  while (state.accumulator >= STEP) {
    updateBot(match, BOT, state.brain, STEP);
    step(match);
    state.accumulator -= STEP;
  }
  if (match.phase === 'serve') state.banner = null;
  if (match.phase === 'rally') {
    state.trail.push({ x: match.ball.x, y: match.ball.y, z: match.ball.z });
    if (state.trail.length > TRAIL_LENGTH) state.trail.shift();
  } else {
    state.trail = [];
  }
  handleEvents(match);
}

function updateResult(dt) {
  const { result } = state;
  result.time += dt;
  const due = Math.min(result.stars, Math.floor(result.time / STAR_DELAY));
  while (result.shown < due) {
    sfx.star(result.shown);
    result.shown += 1;
  }
}

// ---- Drawing ----

function button(x, y, w, h, label, onPress, { primary = false } = {}) {
  const t = theme();
  ctx.fillStyle = primary ? t.accent : t.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = t.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) {
    drawText(ctx, label, x + w / 2, y + Math.floor((h - 7) / 2), primary ? t.bg : t.text, { align: 'center' });
  }
  buttons.push({ x, y, w, h, onPress });
}

function dim() {
  fillView(ctx, 'rgba(0,0,0,0.72)');
}

function drawHud(match) {
  const t = theme();
  drawText(ctx, 'YOU', 6, 3, t.text);
  drawText(ctx, match.score[YOU], 6, 12, t.accent, { scale: 1 });
  drawText(ctx, match.opponent.name, 140, 3, t.text, { align: 'right' });
  drawText(ctx, match.score[BOT], 140, 12, t.accent, { align: 'right' });
  drawText(ctx, `TO ${WIN_SCORE}`, 73, 3, t.wall, { align: 'center' });
  ctx.fillStyle = t.text;
  ctx.fillRect(163, 5, 3, 9);
  ctx.fillRect(169, 5, 3, 9);
}

function drawControls(match) {
  const t = theme();
  ctx.fillStyle = t.wall;
  ctx.globalAlpha = 0.35;
  if (state.stick) {
    const { ox, oy, x, y } = state.stick;
    ctx.fillRect(ox - STICK_RADIUS, oy - STICK_RADIUS, STICK_RADIUS * 2, STICK_RADIUS * 2);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = t.accent;
    const dx = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, x - ox));
    const dy = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, y - oy));
    ctx.fillRect(Math.round(ox + dx) - 5, Math.round(oy + dy) - 5, 10, 10);
  } else {
    ctx.fillRect(14, CONTROLS_TOP + 8, 60, 60);
    ctx.globalAlpha = 1;
    drawText(ctx, 'MOVE', 44, CONTROLS_TOP + 34, t.text, { align: 'center' });
  }
  ctx.globalAlpha = 1;
  const serving = match.phase === 'serve' && match.server === YOU;
  for (const b of SHOT_BUTTONS) {
    const active = state.pressedShot === b.shot || (serving && b.shot === 'drive');
    ctx.fillStyle = active ? t.accent : t.panel;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = t.wall;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    const label = serving && b.shot === 'drive' ? 'SERVE' : b.label;
    drawText(ctx, label, b.x + b.w / 2, b.y + Math.floor((b.h - 7) / 2), active ? t.bg : t.text, { align: 'center' });
  }
}

function drawTieBreak(match) {
  const t = theme();
  fillView(ctx, 'rgba(0,0,0,0.85)');
  drawText(ctx, `${match.score[YOU]}-${match.score[BOT]}`, 90, 100, t.accent, { scale: 5, align: 'center' });
  drawText(ctx, 'WIN BY 2', 90, 160, t.text, { scale: 3, align: 'center' });
  drawText(ctx, 'CLEAR POINTS', 90, 192, t.text, { scale: 2, align: 'center' });
}

function drawGame() {
  const { match } = state;
  const t = theme();
  drawCourt(ctx, t);
  if (match.landing && match.toHit === YOU) {
    drawLanding(ctx, match.landing, t.line, Math.sin(state.clock * 12) * 0.5 + 0.5);
  }

  // Far things first, so nearer ones overlap them.
  const you = { y: match.players[YOU].y, draw: () => drawPlayer(ctx, match.players[YOU], yourKit(), t.accent) };
  const bot = { y: match.players[BOT].y, draw: () => drawPlayer(ctx, match.players[BOT], match.opponent.kit) };
  const ball = { y: match.ball.y, draw: () => drawBall(ctx, match.ball, state.trail, t.ball) };
  [you, bot, ball].sort((a, b) => a.y - b.y).forEach((item) => item.draw());

  drawHud(match);
  drawControls(match);

  if (match.phase === 'point' && isTieBreak(match)) {
    drawTieBreak(match);
  } else if (state.banner) {
    const color = state.banner.won ? t.accent : t.text;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(-VIEW.ox, 118, VIEW.w, 34);
    drawText(ctx, state.banner.detail, 90, 124, color, { align: 'center' });
    drawText(ctx, state.banner.text, 90, 138, t.text, { align: 'center' });
  } else if (match.phase === 'serve' && match.server === BOT) {
    drawText(ctx, `${match.opponent.name} TO SERVE`, 90, 130, t.ball, { align: 'center' });
  }
}

function drawTitle() {
  const t = theme();
  drawCourt(ctx, t);
  fillView(ctx, 'rgba(0,0,0,0.4)');
  drawText(ctx, 'RALLY', 90, 40, t.accent, { scale: 4, align: 'center', shadow: t.bg });
  drawText(ctx, 'RUSH', 90, 76, t.text, { scale: 4, align: 'center', shadow: t.bg });
  // Raise the racket, wait, then play the stroke, every couple of seconds.
  const beat = state.clock % 2;
  const waiting = beat < SWING_WINDOW ? SWING_WINDOW - beat : 0;
  const swinging = beat >= SWING_WINDOW && beat < SWING_WINDOW + SWING_ANIM ? SWING_WINDOW + SWING_ANIM - beat : 0;
  drawPlayer(ctx, {
    x: 2.1, y: 6.2, mx: 0, my: 0, run: 0, anim: swinging, window: waiting, facing: 1,
  }, yourKit());
  drawPlayer(ctx, { x: 4.4, y: 5.4, mx: 0, my: 0, run: 0, anim: 0, facing: -1 }, OPPONENTS[state.levelIndex].kit);
  button(50, 232, 80, 26, 'PLAY', () => go('select'), { primary: true });
  button(50, 264, 80, 22, 'UNLOCKS', () => go('gallery'));
  button(50, 292, 80, 22, progress.data.muted ? 'SOUND OFF' : 'SOUND ON', toggleSound);
  drawSprite(ctx, STAR, 72, 326, [t.accent]);
  drawText(ctx, `${progress.totalStars()}/${OPPONENTS.length * 3}`, 84, 326, t.text);
}

function drawSelect() {
  const t = theme();
  drawCourt(ctx, t);
  dim();
  drawText(ctx, 'CHOOSE AN OPPONENT', 90, 12, t.text, { align: 'center' });
  CLUBS.forEach((club, c) => {
    const top = 32 + c * 90;
    drawText(ctx, club.name, 8, top, t.accent);
    OPPONENTS.forEach((opponent, i) => {
      if (opponent.club !== c) return;
      const x = 8 + (i % 4) * 42;
      const y = top + 12;
      if (!progress.isLevelOpen(i)) {
        button(x, y, 38, 62, '', () => {});
        drawSprite(ctx, LOCK, x + 15, y + 25, [t.wall, t.bg]);
        return;
      }
      button(x, y, 38, 62, '', () => startMatch(i));
      drawText(ctx, i + 1, x + 19, y + 8, t.text, { scale: 2, align: 'center' });
      const short = opponent.name.replace('THE ', '').slice(0, 6);
      drawText(ctx, short, x + 19, y + 30, t.text, { align: 'center' });
      for (let s = 0; s < 3; s++) {
        drawSprite(ctx, STAR_SMALL, x + 3 + s * 11, y + 48, [s < progress.stars(i) ? t.accent : t.wall]);
      }
    });
  });
  button(8, 318, 78, 26, 'BACK', () => go('title'));
  button(94, 318, 78, 26, 'UNLOCKS', () => go('gallery'));
}

function galleryCell(x, y, item, selected, drawIcon, onPress) {
  const t = theme();
  const open = progress.isUnlocked(item);
  button(x, y, 38, 30, '', () => {
    state.info = open ? item.name : requirementText(item);
    if (open) onPress?.();
  });
  if (selected) {
    ctx.strokeStyle = t.accent;
    ctx.strokeRect(x + 1.5, y + 1.5, 35, 27);
  }
  if (open) drawIcon(x, y);
  else drawSprite(ctx, LOCK, x + 15, y + 11, [t.wall, t.bg]);
}

function drawGallery() {
  const t = theme();
  drawCourt(ctx, t);
  dim();
  drawText(ctx, 'UNLOCKS', 90, 12, t.text, { align: 'center' });

  drawText(ctx, 'KITS', 8, 34, t.accent);
  KITS.forEach((kit, i) => {
    const x = 8 + (i % 4) * 42;
    const y = 46 + Math.floor(i / 4) * 34;
    galleryCell(x, y, kit, progress.data.kit === kit.id, (cx, cy) => {
      ctx.fillStyle = kit.shirt;
      ctx.fillRect(cx + 12, cy + 7, 14, 9);
      ctx.fillStyle = kit.shorts;
      ctx.fillRect(cx + 13, cy + 16, 12, 6);
    }, () => progress.equip('kit', kit.id));
  });

  drawText(ctx, 'COURTS', 8, 126, t.accent);
  THEMES.forEach((item, i) => {
    const preview = THEMES_BY_ID[item.id] ?? t;
    galleryCell(8 + i * 42, 138, item, progress.data.theme === item.id, (cx, cy) => {
      ctx.fillStyle = preview.front;
      ctx.fillRect(cx + 6, cy + 5, 26, 10);
      ctx.fillStyle = preview.line;
      ctx.fillRect(cx + 6, cy + 9, 26, 1);
      ctx.fillStyle = preview.floor;
      ctx.fillRect(cx + 6, cy + 15, 26, 10);
    }, () => progress.equip('theme', item.id));
  });

  drawText(ctx, 'TROPHIES', 8, 184, t.accent);
  TROPHIES.forEach((item, i) => {
    galleryCell(8 + i * 42, 196, item, false, (cx, cy) => {
      drawSprite(ctx, TROPHY, cx + 14, cy + 10, [item.color, '#ffffff']);
    });
  });

  drawText(ctx, state.info || 'TAP AN ITEM', 90, 246, t.text, { align: 'center' });
  button(50, 318, 80, 26, 'BACK', () => go(state.match ? 'select' : 'title'));
}

function drawPause() {
  drawGame();
  dim();
  buttons = [];
  const t = theme();
  drawText(ctx, 'PAUSED', 90, 90, t.text, { scale: 3, align: 'center' });
  button(50, 140, 80, 26, 'RESUME', () => go('play'), { primary: true });
  button(50, 174, 80, 26, 'RESTART', () => startMatch(state.levelIndex));
  button(50, 208, 80, 26, 'OPPONENTS', () => go('select'));
}

function drawScoreLine(y) {
  const { match } = state;
  const t = theme();
  drawText(ctx, `${match.score[YOU]} - ${match.score[BOT]}`, 90, y, t.text, { scale: 2, align: 'center' });
}

function drawResult() {
  const { result, levelIndex } = state;
  const t = theme();
  drawGame();
  dim();
  buttons = [];
  drawText(ctx, 'YOU WIN!', 90, 40, t.accent, { scale: 3, align: 'center' });
  for (let i = 0; i < 3; i++) {
    drawSprite(ctx, STAR, 51 + i * 28, 74, [i < result.shown ? t.accent : t.wall], 3);
  }
  drawScoreLine(104);
  if (result.newBest) drawText(ctx, 'NEW BEST WIN!', 90, 124, t.accent, { align: 'center' });

  if (result.time > STAR_DELAY * (result.stars + 1) && result.unlocks.length) {
    drawText(ctx, 'UNLOCKED', 90, 144, t.accent, { align: 'center' });
    result.unlocks.slice(0, 3).forEach((item, i) => {
      drawText(ctx, `${item.kind}: ${item.name}`, 90, 158 + i * 12, t.text, { align: 'center' });
    });
  }

  if (levelIndex < OPPONENTS.length - 1) {
    button(50, 206, 80, 26, 'NEXT MATCH', () => startMatch(levelIndex + 1), { primary: true });
  } else {
    drawText(ctx, 'WORLD CHAMPION!', 90, 214, t.accent, { align: 'center' });
  }
  button(50, 240, 80, 26, 'REMATCH', () => startMatch(levelIndex));
  button(50, 274, 80, 26, 'OPPONENTS', () => go('select'));
}

function drawGameOver() {
  const t = theme();
  drawGame();
  dim();
  buttons = [];
  drawText(ctx, 'MATCH', 90, 70, t.text, { scale: 4, align: 'center' });
  drawText(ctx, 'LOST', 90, 106, t.text, { scale: 4, align: 'center' });
  drawScoreLine(150);
  button(50, 190, 80, 26, 'REMATCH', () => startMatch(state.levelIndex), { primary: true });
  button(50, 224, 80, 26, 'OPPONENTS', () => go('select'));
}

const SCREENS = {
  title: drawTitle,
  select: drawSelect,
  gallery: drawGallery,
  play: drawGame,
  pause: drawPause,
  result: drawResult,
  gameover: drawGameOver,
};

function draw() {
  buttons = [];
  const { bg } = theme();
  ctx.setTransform(1, 0, 0, 1, VIEW.ox, VIEW.oy);
  fillView(ctx, bg);
  SCREENS[state.screen]();
  if (document.body.dataset.bg !== bg) {
    document.body.dataset.bg = bg;
    document.body.style.background = bg;
  }
}

// ---- Input ----

function go(screen) {
  state.info = '';
  state.stick = null;
  state.screen = screen;
}

function pause() {
  if (state.screen === 'play' && state.match.phase !== 'over') go('pause');
}

function toggleSound() {
  const muted = !progress.data.muted;
  progress.equip('muted', muted);
  setMuted(muted);
}

function playShot(shot) {
  const { match } = state;
  if (match.phase === 'serve' && match.server === YOU) serve(match, shot === 'lob' ? 'lob' : 'serve');
  else swing(match, YOU, shot);
}

function shotAt(x, y) {
  const b = SHOT_BUTTONS.find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
  return b?.shot ?? 'drive';
}

function press(id, x, y) {
  if (state.screen !== 'play') return;
  if (x > 145 && y < 22) {
    pause();
    return;
  }
  if (x < W / 2) {
    if (!state.stick) state.stick = { id, ox: x, oy: y, x, y };
    return;
  }
  state.pressedShot = shotAt(x, y);
  playShot(state.pressedShot);
}

function slide(id, x, y) {
  if (state.stick?.id !== id) return;
  state.stick.x = x;
  state.stick.y = y;
}

function release(id) {
  if (state.stick?.id === id) state.stick = null;
  state.pressedShot = null;
}

function tap(x, y) {
  if (state.screen === 'play') return;
  const hit = buttons.findLast((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  if (hit) {
    sfx.tap();
    hit.onPress();
  }
}

function toLogical(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * VIEW.w - VIEW.ox,
    y: ((e.clientY - rect.top) / rect.height) * VIEW.h - VIEW.oy,
  };
}

bindInput(canvas, toLogical, {
  first: unlockAudio,
  press,
  slide,
  release,
  tap,
  keyShot(shot) {
    if (state.screen === 'play') playShot(shot);
  },
  escape: pause,
});

// Fill the whole screen on any device: the canvas takes the screen's shape and
// the game layout stays centred inside it.
function resize() {
  const stage = canvas.parentElement.getBoundingClientRect();
  if (!stage.width || !stage.height) return;
  setViewAspect(stage.height / stage.width);
  canvas.width = VIEW.w;
  canvas.height = VIEW.h;
  canvas.style.width = `${stage.width}px`;
  canvas.style.height = `${stage.height}px`;
}

addEventListener('resize', resize);
addEventListener('orientationchange', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
resize();

let last = performance.now();

function frame(now) {
  // Cap the time jump after the phone wakes or the tab returns.
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  state.clock += dt;
  if (state.screen === 'play') updatePlay(dt);
  if (state.screen === 'result') updateResult(dt);
  draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
