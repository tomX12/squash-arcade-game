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
export const SWING_ANIM = 0.34;
// How long a press waits, racket raised, for the ball to come into reach.
export const SWING_WINDOW = 0.28;
export const T_SPOT = { x: 3.2, y: 5.9 };
export const WIN_SCORE = 11;
const WIN_MARGIN = 2;

const GRAVITY = 9.81;
// Air resistance for a 40 mm, 24 g ball: density * Cd * area / (2 * mass), taking Cd as 0.5.
const DRAG = 0.0157;
// Halfway between a cold ball, which rebounds to about 13% of its drop height, and a hot one at about 30%.
const BOUNCE = 0.46;
// A little livelier off the floor, so a hard drive sits up to knee height instead of skidding.
const FLOOR_BOUNCE = 0.58;
// The back wall gives a ball more back, so a drive comes out of the corner and can be played.
const BACK_BOUNCE = 0.6;
const FLOOR_SLOW = 0.8;
const WALL_SLOW = 0.9;
const FRONT_RISE = 0.4;
const SPIN_KICK = 0.35;
const AIM_PASSES = 3;
const MIN_FLIGHT = 0.12;
const SWING_COOLDOWN = 0.38;
const POINT_PAUSE = 1.5;
const TIE_BREAK_PAUSE = 3;
const MIN_PLAYER_GAP = 0.6;
// Interference: the player who has just hit is in the way when they stand within
// BLOCK_DISTANCE of the other player and inside BLOCK_CONE of that player's line to the ball.
const BLOCK_DISTANCE = 1;
const BLOCK_CONE = (30 * Math.PI) / 180;
// How long the blocked player must be held up before the referee calls it.
const BLOCK_TIME = 0.2;
// Time a player gets to clear after hitting before standing in the way costs a stroke.
const CLEAR_TIME = 0.45;
// A player gets this many lets a game. After that, interference from an opponent who is
// clearing means play on, so running into people stops paying; not clearing is still a stroke.
const LETS_PER_GAME = 2;
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
    window: 0, cooldown: 0, shot: null, heightError: 0, struckAt: -10,
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
    lets: [0, 0],
    blocking: null,
    blockTime: 0,
    pending: null,
    shotAt: 0,
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
    blocking: null, blockTime: 0, pending: null,
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
  Object.assign(player, { shot, heightError, window: SWING_WINDOW, cooldown: SWING_COOLDOWN });
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
  player.struckAt = match.time;
  match.shotAt = match.time;
  // Playing the ball despite interference means no call.
  match.pending = null;
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
  // A call waiting on the shot that never came is made now instead.
  if (match.pending) {
    makeCall(match);
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
    ball.vy = -Math.abs(ball.vy) * BACK_BOUNCE;
    match.events.push({ type: 'wall' });
  }

  if (hitFloor) {
    if (!match.frontHit) return endRally(match, 1 - match.striker, 'DOWN!');
    match.bounces += 1;
    if (match.bounces >= 2) return endRally(match, match.striker, 'DOUBLE BOUNCE');
    ball.vz = Math.abs(ball.vz) * FLOOR_BOUNCE;
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
  player.cooldown = Math.max(0, player.cooldown - STEP);
  player.anim = Math.max(0, player.anim - STEP);
  if (player.window <= 0) return;
  player.window = Math.max(0, player.window - STEP);
  if (!canHit(match, i)) {
    // Nothing came into reach, so the swing goes through empty air.
    if (player.window <= 0) player.anim = SWING_ANIM;
    return;
  }

  const { ball } = match;
  // Stretching for the ball makes the shot riskier.
  const stretch = Math.hypot(ball.x - player.x, ball.y - player.y) / REACH;
  const miss = stretch > 0.75 ? (stretch - 0.75) * match.random() * 1.2 : 0;
  let landX = ball.x < COURT.width / 2 ? 0.7 : COURT.width - 0.7;
  if (player.aim !== 0) landX = player.aim < 0 ? 0.8 : COURT.width - 0.8;
  strike(match, i, player.shot, landX, player.heightError - miss);
}

function speedOf(match, i) {
  return i === YOU ? PLAYER_SPEED : match.opponent.speed;
}

// Where player i would naturally take the ball: the first point at a comfortable height after
// it bounces that they can get to in time, or failing that the first point they can reach at all.
// Path times count from the shot, so `at` is when the ball gets there.
export function hitPoint(match, i) {
  const player = match.players[i];
  const struck = match.shotAt;
  const elapsed = match.time - struck;
  const speed = speedOf(match, i);
  const inTime = match.path.filter((p) => p.z < HIT_HEIGHT && p.t > elapsed
    && Math.max(0, Math.hypot(p.x - player.x, p.y - player.y) - REACH) / speed <= p.t - elapsed);
  const point = inTime.find((p) => p.bounces >= 1 && p.z < 1.6) ?? inTime[0];
  return point ? { ...point, at: struck + point.t } : null;
}

const unit = (x, y) => {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length, length } : { x: 0, y: 0, length: 0 };
};

// Is the player who has just hit standing in the other player's way to the ball?
// Returns which way they should move to get out of it, or null. A larger `distance`
// lets a player see they are about to be in the way.
export function inTheWay(match, distance = BLOCK_DISTANCE) {
  if (match.phase !== 'rally') return null;
  const blocked = match.players[match.toHit];
  const blocker = match.players[1 - match.toHit];
  const target = hitPoint(match, match.toHit);
  if (!target) return null;
  const toBall = unit(target.x - blocked.x, target.y - blocked.y);
  const toBlocker = unit(blocker.x - blocked.x, blocker.y - blocked.y);
  if (toBlocker.length > distance || toBlocker.length > toBall.length) return null;
  const cos = toBall.x * toBlocker.x + toBall.y * toBlocker.y;
  if (cos < Math.cos(BLOCK_CONE)) return null;
  // Out to whichever side of the line the blocker is already on.
  const side = toBall.x * toBlocker.y - toBall.y * toBlocker.x >= 0 ? 1 : -1;
  return {
    target, toBall, toBlocker, clear: { x: -toBall.y * side, y: toBall.x * side },
  };
}

function makeCall(match) {
  const { call, player } = match.pending;
  match.pending = null;
  match.blocking = null;
  if (call === 'stroke') {
    endRally(match, player, 'STROKE');
    return;
  }
  match.lets[player] += 1;
  Object.assign(match, {
    phase: 'point', winner: null, reason: 'LET', landing: null, path: [], timer: POINT_PAUSE,
  });
  match.events.push({ type: 'let' });
}

// An automatic referee. A call needs the blocked player to be heading for a ball they could
// still reach, so running into the other player to fish for a let gets nothing. It decides
// when the interference happens, but only calls it when the shot would have been played.
function referee(match) {
  const way = inTheWay(match);
  match.blocking = way ? 1 - match.toHit : null;
  if (match.pending) {
    if (match.time >= match.pending.at) makeCall(match);
    return;
  }
  const blocked = match.players[match.toHit];
  const heading = unit(blocked.mx, blocked.my);
  if (!way || heading.length < 0.3 || heading.x * way.toBall.x + heading.y * way.toBall.y < 0.5) {
    match.blockTime = 0;
    return;
  }
  match.blockTime += STEP;
  if (match.blockTime < BLOCK_TIME) return;

  const b = match.blocking;
  const blocker = match.players[b];
  const moving = unit(blocker.mx, blocker.my);
  // Stepping off the line either way, or backing away, counts as trying to clear.
  const clearing = moving.length > 0.3 && (Math.abs(moving.x * way.clear.x + moving.y * way.clear.y) > 0.4
    || moving.x * way.toBlocker.x + moving.y * way.toBlocker.y > 0.4);
  const justHit = match.time - blocker.struckAt < CLEAR_TIME;
  let call = null;
  if (!justHit && !clearing) call = 'stroke';
  else if (match.lets[match.toHit] < LETS_PER_GAME) call = 'let';
  if (call) match.pending = { call, player: match.toHit, at: way.target.at };
}

function nextPoint(match) {
  // A let replays the point: same server, same side.
  if (match.winner === null) {
    setupServe(match);
    return;
  }
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
    movePlayer(match, receiver, speedOf(match, receiver));
    keepInCourt(match.players[receiver]);
    holdBall(match);
    return;
  }
  if (match.phase !== 'rally') return;

  movePlayer(match, YOU, speedOf(match, YOU));
  movePlayer(match, BOT, speedOf(match, BOT));
  separatePlayers(match);
  match.players.forEach(keepInCourt);
  referee(match);
  if (match.phase !== 'rally') return;
  updateSwing(match, YOU);
  updateSwing(match, BOT);
  stepBall(match);
}

export function starsFor(match) {
  const conceded = match.score[BOT];
  if (conceded <= WIN_SCORE / 3) return 3;
  return conceded <= (WIN_SCORE * 2) / 3 ? 2 : 1;
}
