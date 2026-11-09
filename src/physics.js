// Squash rules and 3D ball flight, in metres. No drawing or browser APIs, so this runs in tests.
// x runs left to right, y from the front wall to the back wall, z is height.

export const COURT = {
  width: 6.4, length: 9.75, frontLine: 4.57, backLine: 2.13, service: 1.78, tin: 0.48,
  shortLine: 5.49, box: 1.6,
};
export const STEP = 1 / 120;
export const REACH = 1.3;
export const HIT_HEIGHT = 2.5;
export const PLAYER_SPEED = 4.6;
export const SWING_ANIM = 0.22;
export const T_SPOT = { x: 3.2, y: 5.9 };
export const WIN_SCORE = 11;
const WIN_MARGIN = 2;

const GRAVITY = 9.81;
// Air resistance for a 40 mm, 24 g ball: density * Cd * area / (2 * mass), taking Cd as 0.5.
const DRAG = 0.0157;
// Halfway between a cold ball, which rebounds to about 13% of its drop height, and a hot one at about 30%.
const BOUNCE = 0.46;
const FLOOR_SLOW = 0.8;
const WALL_SLOW = 0.9;
const FRONT_RISE = 0.4;
const SPIN_KICK = 0.35;
const AIM_PASSES = 3;
const MIN_FLIGHT = 0.12;
const SWING_WINDOW = 0.28;
const SWING_COOLDOWN = 0.38;
const POINT_PAUSE = 1.5;
const TIE_BREAK_PAUSE = 3;
const MIN_PLAYER_GAP = 0.6;
// `spread` allows for sideways drift off the front wall: the longer the ball hangs after it, the more it needs.
// `carry` is the most extra pace a cleanly struck shot can pick up, so some go deep and others die short.
const SHOTS = {
  serve: { speed: 18, height: 3.1, spin: 0, spread: 16, carry: 0.3 },
  drive: { speed: 28, height: 1.6, spin: 1, spread: 20, carry: 0 },
  lob: { speed: 15, height: 4.1, spin: 0, spread: 16, carry: 0.3 },
  drop: { speed: 8, height: 0.8, spin: 3, spread: 2, carry: 0 },
};

export const YOU = 0;
export const BOT = 1;

function makePlayer() {
  return {
    x: 0, y: 0, mx: 0, my: 0, aim: 0, run: 0, anim: 0, facing: 1,
    window: 0, cooldown: 0, shot: null, heightError: 0,
  };
}

export function createMatch(opponent, random = Math.random) {
  const match = {
    opponent,
    random,
    players: [makePlayer(), makePlayer()],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 },
    phase: 'serve', // serve | rally | point | over
    server: YOU,
    side: 'right',
    score: [0, 0],
    toHit: YOU,
    striker: YOU,
    frontHit: true,
    bounces: 0,
    rally: 0,
    timer: 0,
    time: 0,
    winner: null,
    reason: '',
    landing: null,
    path: [],
    events: [],
  };
  setupServe(match);
  return match;
}

function setupServe(match) {
  const boxX = match.side === 'right' ? 5.6 : 0.8;
  const server = match.players[match.server];
  const receiver = match.players[1 - match.server];
  Object.assign(server, { x: boxX, y: 6.3 });
  Object.assign(receiver, { x: COURT.width - boxX, y: 7.7 });
  for (const player of match.players) Object.assign(player, { window: 0, cooldown: 0, anim: 0, mx: 0, my: 0 });
  Object.assign(match, {
    phase: 'serve', toHit: match.server, frontHit: true, bounces: 0, rally: 0, timer: 1, landing: null, path: [],
  });
  holdBall(match);
}

function holdBall(match) {
  const server = match.players[match.server];
  Object.assign(match.ball, { x: server.x, y: server.y - 0.3, z: 1.1, vx: 0, vy: 0, vz: 0, spin: 0 });
}

export function serve(match, shot = 'serve') {
  if (match.phase !== 'serve') return;
  const landX = match.side === 'right' ? 1 : 5.4;
  match.phase = 'rally';
  strike(match, match.server, shot, landX);
}

export function swing(match, i, shot, heightError = 0) {
  const player = match.players[i];
  if (player.cooldown > 0 || match.phase !== 'rally') return;
  Object.assign(player, { shot, heightError, window: SWING_WINDOW, cooldown: SWING_COOLDOWN, anim: SWING_ANIM });
}

export function canHit(match, i) {
  if (match.phase !== 'rally' || match.toHit !== i || !match.frontHit) return false;
  const { ball } = match;
  const player = match.players[i];
  return ball.z < HIT_HEIGHT && Math.hypot(ball.x - player.x, ball.y - player.y) < REACH;
}

function fly(ball) {
  const drag = DRAG * Math.hypot(ball.vx, ball.vy, ball.vz) * STEP;
  ball.vx -= ball.vx * drag;
  ball.vy -= ball.vy * drag;
  ball.vz -= ball.vz * drag + GRAVITY * STEP;
  ball.x += ball.vx * STEP;
  ball.y += ball.vy * STEP;
  ball.z += ball.vz * STEP;
}

// Drag has no neat formula, so fly a test ball and correct the launch by however much it missed.
function aimAt(ball, target, time) {
  ball.vx = (target.x - ball.x) / time;
  ball.vy = (target.y - ball.y) / time;
  ball.vz = (target.z - ball.z + 0.5 * GRAVITY * time * time) / time;
  for (let pass = 0; pass < AIM_PASSES; pass++) {
    const test = { ...ball };
    for (let t = 0; t < time; t += STEP) fly(test);
    ball.vx += (target.x - test.x) / time;
    ball.vy += (target.y - test.y) / time;
    ball.vz += (target.z - test.z) / time;
  }
}

function strike(match, i, shotName, landX, heightError = 0) {
  const { ball } = match;
  const shot = SHOTS[shotName];
  const wallX = Math.max(0.3, Math.min(COURT.width - 0.3, (ball.x * shot.spread + landX * ball.y) / (ball.y + shot.spread)));
  const distance = Math.hypot(wallX - ball.x, ball.y);
  const speed = shot.speed * (1 + shot.carry * match.random());
  const time = Math.max(MIN_FLIGHT, distance / speed);
  // Up close there is no room to lift the ball, so the aim point drops with distance.
  const height = Math.min(shot.height, 1 + distance * 0.5) + heightError;
  aimAt(ball, { x: wallX, y: 0, z: height }, time);
  ball.spin = shot.spin;

  const player = match.players[i];
  player.anim = SWING_ANIM;
  player.window = 0;
  player.facing = ball.x >= player.x ? 1 : -1;
  Object.assign(match, { striker: i, toHit: 1 - i, frontHit: false, bounces: 0 });
  match.rally += 1;
  match.events.push({ type: 'hit', player: i, rally: match.rally });
  const flight = predict(match);
  match.landing = flight.landing;
  match.path = flight.path;
}

// Flies a copy of the ball forward to see where it will land.
export function predict(match) {
  const copy = {
    ...match, predicting: true, phase: 'rally', ball: { ...match.ball }, events: [],
  };
  const path = [];
  let landing = null;
  for (let i = 0; i < 480 && copy.phase === 'rally'; i++) {
    const before = copy.bounces;
    stepBall(copy);
    if (copy.frontHit && !landing && copy.bounces > before) landing = { x: copy.ball.x, y: copy.ball.y };
    if (copy.frontHit && i % 3 === 0) {
      path.push({ x: copy.ball.x, y: copy.ball.y, z: copy.ball.z, bounces: copy.bounces, t: i * STEP });
    }
  }
  return { landing, path };
}

export function isTieBreak(match) {
  return match.score.every((points) => points === WIN_SCORE - 1);
}

function endRally(match, winner, reason) {
  if (match.predicting) {
    match.phase = 'ended';
    return;
  }
  Object.assign(match, {
    phase: 'point', winner, reason, landing: null, path: [],
  });
  match.score[winner] += 1;
  match.timer = isTieBreak(match) ? TIE_BREAK_PAUSE : POINT_PAUSE;
  match.events.push({ type: 'point', winner, reason });
}

function outLine(y) {
  return COURT.frontLine - ((COURT.frontLine - COURT.backLine) * y) / COURT.length;
}

function stepBall(match) {
  const { ball } = match;
  const wallFault = () => endRally(match, 1 - match.striker, 'OUT!');
  fly(ball);

  // Corners cross two walls in one step, so bring the ball inside before any rule ends the rally.
  const hitFront = ball.y <= 0;
  const hitSide = ball.x <= 0 || ball.x >= COURT.width;
  const hitBack = ball.y >= COURT.length;
  ball.x = Math.max(0, Math.min(COURT.width, ball.x));
  ball.y = Math.max(0, Math.min(COURT.length, ball.y));
  const hitFloor = ball.z <= 0;
  ball.z = Math.max(0, ball.z);

  if (hitFront) {
    ball.vy = Math.abs(ball.vy) * BOUNCE;
    ball.vx *= WALL_SLOW;
    ball.vz *= ball.vz > 0 ? FRONT_RISE : FLOOR_SLOW;
    // Backspin grips the wall and drags the ball down, which is how a cut shot stays low.
    ball.vz -= ball.spin * SPIN_KICK;
    ball.spin = 0;
    if (!match.frontHit) {
      if (ball.z < COURT.tin) return endRally(match, 1 - match.striker, 'TIN!');
      if (ball.z > COURT.frontLine) return wallFault();
      match.frontHit = true;
      match.bounces = 0;
    }
    match.events.push({ type: 'front' });
  }

  if (hitSide) {
    if (ball.z > outLine(ball.y)) return wallFault();
    ball.vx = -ball.vx * BOUNCE;
    match.events.push({ type: 'wall' });
  }

  if (hitBack) {
    if (ball.z > COURT.backLine) return wallFault();
    ball.vy = -Math.abs(ball.vy) * BOUNCE;
    match.events.push({ type: 'wall' });
  }

  if (hitFloor) {
    if (!match.frontHit) return endRally(match, 1 - match.striker, 'DOWN!');
    match.bounces += 1;
    if (match.bounces >= 2) return endRally(match, match.striker, 'DOUBLE BOUNCE');
    ball.vz = Math.abs(ball.vz) * BOUNCE;
    ball.vx *= FLOOR_SLOW;
    ball.vy *= FLOOR_SLOW;
    match.events.push({ type: 'floor' });
  }
  return undefined;
}

function movePlayer(match, i, speed) {
  const player = match.players[i];
  const length = Math.hypot(player.mx, player.my);
  const scale = length > 1 ? 1 / length : 1;
  player.x += player.mx * scale * speed * STEP;
  player.y += player.my * scale * speed * STEP;
  player.run += length * STEP;
  if (Math.abs(player.mx) > 0.1) player.facing = Math.sign(player.mx);
}

function keepInCourt(player) {
  player.x = Math.max(0.3, Math.min(COURT.width - 0.3, player.x));
  player.y = Math.max(0.4, Math.min(COURT.length - 0.3, player.y));
}

function separatePlayers(match) {
  const [a, b] = match.players;
  const gap = Math.hypot(a.x - b.x, a.y - b.y) || 0.01;
  if (gap >= MIN_PLAYER_GAP) return;
  const push = (MIN_PLAYER_GAP - gap) / 2 / gap;
  const dx = (a.x - b.x) * push;
  const dy = (a.y - b.y) * push;
  a.x += dx;
  a.y += dy;
  b.x -= dx;
  b.y -= dy;
}

function updateSwing(match, i) {
  const player = match.players[i];
  player.window = Math.max(0, player.window - STEP);
  player.cooldown = Math.max(0, player.cooldown - STEP);
  player.anim = Math.max(0, player.anim - STEP);
  if (player.window <= 0 || !canHit(match, i)) return;

  const { ball } = match;
  // Stretching for the ball makes the shot riskier.
  const stretch = Math.hypot(ball.x - player.x, ball.y - player.y) / REACH;
  const miss = stretch > 0.75 ? (stretch - 0.75) * match.random() * 1.2 : 0;
  let landX = ball.x < COURT.width / 2 ? 0.7 : COURT.width - 0.7;
  if (player.aim !== 0) landX = player.aim < 0 ? 0.8 : COURT.width - 0.8;
  strike(match, i, player.shot, landX, player.heightError - miss);
}

function nextPoint(match) {
  const [you, bot] = match.score;
  if (Math.max(you, bot) >= WIN_SCORE && Math.abs(you - bot) >= WIN_MARGIN) {
    match.phase = 'over';
    match.winner = you > bot ? YOU : BOT;
    match.events.push({ type: 'over', winner: match.winner });
    return;
  }
  if (match.winner === match.server) match.side = match.side === 'right' ? 'left' : 'right';
  else {
    match.server = match.winner;
    match.side = 'right';
  }
  setupServe(match);
}

export function step(match) {
  match.time += STEP;
  if (match.phase === 'point') {
    match.timer -= STEP;
    if (match.timer <= 0) nextPoint(match);
    return;
  }
  if (match.phase === 'serve') {
    const receiver = 1 - match.server;
    movePlayer(match, receiver, receiver === YOU ? PLAYER_SPEED : match.opponent.speed);
    keepInCourt(match.players[receiver]);
    holdBall(match);
    return;
  }
  if (match.phase !== 'rally') return;

  movePlayer(match, YOU, PLAYER_SPEED);
  movePlayer(match, BOT, match.opponent.speed);
  separatePlayers(match);
  match.players.forEach(keepInCourt);
  updateSwing(match, YOU);
  updateSwing(match, BOT);
  stepBall(match);
}

export function starsFor(match) {
  const conceded = match.score[BOT];
  if (conceded <= WIN_SCORE / 3) return 3;
  return conceded <= (WIN_SCORE * 2) / 3 ? 2 : 1;
}
