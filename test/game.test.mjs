import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT, COURT, STEP, WIN_SCORE, YOU, createMatch, isTieBreak, predict, serve, starsFor, step, swing,
} from '../src/physics.js';
import { createBrain, updateBot } from '../src/bot.js';
import { OPPONENTS } from '../src/levels.js';
import {
  KITS, Progress, THEMES, TROPHIES,
} from '../src/progress.js';

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const PROFILE = { speed: 4.6, reaction: 0.2, skill: 0.9 };

// Plays a full match with a bot on each side, checking the ball on every step.
function playMatch(opponent, seed, you = PROFILE) {
  const match = createMatch(opponent, seededRandom(seed));
  const brains = [createBrain(), createBrain()];
  const reasons = {};
  let rallies = 0;
  let shots = 0;
  for (let i = 0; i < 60 * 60 / STEP && match.phase !== 'over'; i++) {
    updateBot(match, YOU, brains[0], STEP, you);
    updateBot(match, BOT, brains[1], STEP);
    step(match);
    const { ball } = match;
    assert.ok(Number.isFinite(ball.x + ball.y + ball.z), 'ball position is a number');
    assert.ok(ball.x >= 0 && ball.x <= COURT.width && ball.y >= 0 && ball.y <= COURT.length, 'ball in court');
    assert.ok(ball.z >= 0, 'ball above the floor');
    for (const event of match.events) {
      if (event.type === 'point') {
        reasons[event.reason] = (reasons[event.reason] ?? 0) + 1;
        rallies += 1;
      }
      if (event.type === 'hit') shots += 1;
    }
    match.events.length = 0;
  }
  assert.equal(match.phase, 'over', 'match finished');
  return { match, reasons, shotsPerRally: shots / rallies };
}

function rallyAtFrontWall(height) {
  const match = createMatch(OPPONENTS[0]);
  serve(match);
  Object.assign(match.ball, { x: 3, y: 0.05, z: height, vx: 0, vy: -10, vz: 0 });
  match.events.length = 0;
  step(match);
  return match;
}

test('a ball under the tin loses the point for the striker', () => {
  const match = rallyAtFrontWall(0.3);
  assert.equal(match.reason, 'TIN!');
  assert.deepEqual(match.score, [0, 1]);
});

test('a ball above the front line is out', () => {
  assert.equal(rallyAtFrontWall(4.8).reason, 'OUT!');
});

test('a good ball on the front wall stays in play', () => {
  const match = rallyAtFrontWall(1.5);
  assert.equal(match.phase, 'rally');
  assert.equal(match.frontHit, true);
});

test('a side wall hit above the sloping line is out, but below it is fine', () => {
  const at = (z) => {
    const match = createMatch(OPPONENTS[0]);
    serve(match);
    Object.assign(match.ball, { x: 0.05, y: 5, z, vx: -10, vy: 0, vz: 0 });
    step(match);
    return match;
  };
  assert.equal(at(3.5).reason, 'OUT!');
  assert.equal(at(3).phase, 'rally');
});

test('a ball over the back wall line is out', () => {
  const match = createMatch(OPPONENTS[0]);
  serve(match);
  Object.assign(match.ball, { x: 3, y: 9.74, z: 2.5, vx: 0, vy: 10, vz: 0 });
  step(match);
  assert.equal(match.reason, 'OUT!');
});

test('two bounces lose the point for the player who had to hit', () => {
  const match = createMatch(OPPONENTS[0]);
  serve(match);
  Object.assign(match, { frontHit: true, bounces: 1, toHit: BOT, striker: YOU });
  Object.assign(match.ball, { x: 3, y: 5, z: 0.01, vx: 0, vy: 0, vz: -2 });
  step(match);
  assert.equal(match.reason, 'DOUBLE BOUNCE');
  assert.deepEqual(match.score, [1, 0]);
});

test('a ball that hits the floor before the front wall is down', () => {
  const match = createMatch(OPPONENTS[0]);
  serve(match);
  Object.assign(match.ball, { x: 3, y: 5, z: 0.01, vx: 0, vy: -5, vz: -2 });
  step(match);
  assert.equal(match.reason, 'DOWN!');
});

test('you can only hit after the ball reaches the front wall', () => {
  const match = createMatch(OPPONENTS[0]);
  serve(match);
  const hits = () => match.events.filter((e) => e.type === 'hit').length;
  const before = hits();
  Object.assign(match.players[BOT], { x: match.ball.x, y: match.ball.y });
  swing(match, BOT, 'drive');
  step(match);
  assert.equal(hits(), before);
});

test('every shot from a normal position reaches the front wall legally', () => {
  for (const shot of ['drive', 'lob', 'drop']) {
    for (const x of [0.6, 3.2, 5.8]) {
      for (const y of [2, 5, 9]) {
        const match = createMatch(OPPONENTS[0], () => 0);
        serve(match);
        Object.assign(match, { frontHit: true, toHit: YOU, striker: BOT });
        Object.assign(match.ball, { x, y, z: 0.8 });
        Object.assign(match.players[YOU], { x, y });
        swing(match, YOU, shot);
        match.events.length = 0;
        for (let i = 0; i < 300 && match.phase === 'rally' && !match.frontHit; i++) step(match);
        assert.equal(match.phase, 'rally', `${shot} from ${x},${y}: ${match.reason}`);
      }
    }
  }
});

test('the landing marker matches where the ball first lands', () => {
  const match = createMatch(OPPONENTS[0], () => 0);
  serve(match);
  const { landing } = match;
  let bounced = null;
  for (let i = 0; i < 600 && !bounced; i++) {
    step(match);
    if (match.bounces === 1) bounced = { ...match.ball };
  }
  assert.ok(Math.hypot(bounced.x - landing.x, bounced.y - landing.y) < 0.05);
  assert.ok(predict(match).path.length > 0);
});

for (const [i, opponent] of OPPONENTS.entries()) {
  test(`match against ${i + 1} ${opponent.name} finishes under squash scoring`, () => {
    for (const seed of [1, 2]) {
      const { match } = playMatch(opponent, seed);
      const [you, bot] = match.score;
      assert.ok(Math.max(you, bot) >= WIN_SCORE);
      assert.ok(Math.abs(you - bot) >= 2);
    }
  });
}

test('rallies last several shots, and stronger opponents win more', () => {
  const wins = (opponent) => [1, 2, 3, 4, 5, 6, 7, 8]
    .filter((seed) => playMatch(opponent, seed).match.winner === BOT).length;
  const easy = wins(OPPONENTS[0]);
  const hard = wins(OPPONENTS[11]);
  const { shotsPerRally, reasons } = playMatch(OPPONENTS[6], 3);
  console.log({ easy, hard, shotsPerRally, reasons });
  assert.ok(hard > easy, `easy ${easy}, hard ${hard}`);
  assert.ok(shotsPerRally > 3, `shots per rally ${shotsPerRally}`);
});

function flyFreely(match, steps) {
  Object.assign(match, { frontHit: true, bounces: 0 });
  for (let i = 0; i < steps; i++) step(match);
}

test('air resistance slows a fast ball more than a slow one', () => {
  const loss = (speed) => {
    const match = createMatch(OPPONENTS[0]);
    serve(match);
    Object.assign(match.players[YOU], { x: 3.2, y: 9 });
    Object.assign(match.ball, { x: 3, y: 9, z: 2, vx: 0, vy: -speed, vz: 0 });
    flyFreely(match, 6);
    return speed + match.ball.vy;
  };
  assert.ok(loss(40) > loss(10) * 10, `${loss(40)} against ${loss(10)}`);
});

test('a shot still reaches the height it was aimed at', () => {
  for (const [shot, height] of [['drive', 1.5], ['lob', 3.9], ['drop', 0.8]]) {
    const match = createMatch(OPPONENTS[0], () => 0);
    serve(match);
    Object.assign(match, { frontHit: true, toHit: YOU, striker: BOT });
    Object.assign(match.ball, { x: 3.2, y: 5.9, z: 0.8 });
    Object.assign(match.players[YOU], { x: 3.2, y: 5.9 });
    swing(match, YOU, shot);
    step(match);
    for (let i = 0; i < 300 && match.ball.y > 0.3; i++) step(match);
    assert.ok(Math.abs(match.ball.z - height) < 0.2, `${shot} at ${match.ball.z}`);
  }
});

test('a good drive reaches the back wall between its first and second bounce', () => {
  for (const [x, y] of [[3.2, 5.9], [1, 8.5], [5.4, 8.5], [1, 5.5]]) {
    const match = createMatch(OPPONENTS[0], () => 0);
    serve(match);
    Object.assign(match, { frontHit: true, toHit: YOU, striker: BOT });
    Object.assign(match.ball, { x, y, z: 0.8 });
    Object.assign(match.players[YOU], { x, y });
    Object.assign(match.players[BOT], { x: 3.2, y: 9.3 });
    swing(match, YOU, 'drive');
    let bouncesAtBack = null;
    for (let i = 0; i < 300 && match.phase === 'rally' && bouncesAtBack === null; i++) {
      step(match);
      if (match.frontHit && match.ball.y >= COURT.length - 0.01) bouncesAtBack = match.bounces;
    }
    assert.equal(bouncesAtBack, 1, `drive from ${x},${y}`);
  }
});

test('serves land past the short line and away from the side walls', () => {
  for (const shot of ['serve', 'lob']) {
    const match = createMatch(OPPONENTS[0], () => 0);
    serve(match, shot);
    for (let i = 0; i < 600 && match.bounces === 0; i++) step(match);
    const { x, y } = match.ball;
    assert.ok(y > COURT.shortLine, `${shot} landed at y ${y}`);
    assert.ok(x > 0.4 && x < COURT.width - 0.4, `${shot} landed at x ${x}`);
  }
});

function serveWithRoll(shot, roll) {
  const match = createMatch(OPPONENTS[0], () => roll);
  serve(match, shot);
  for (let i = 0; i < 600 && match.phase === 'rally'; i++) step(match);
  return match;
}

test('a cleanly struck lob or serve comes well off the back wall', () => {
  for (const shot of ['serve', 'lob']) {
    const short = serveWithRoll(shot, 0).ball.y;
    const deep = serveWithRoll(shot, 0.75).ball.y;
    assert.ok(deep < short - 0.5, `${shot} stopped at ${deep} against ${short}`);
  }
});

test('even the deepest lob or serve stays in court', () => {
  for (const shot of ['serve', 'lob']) {
    for (const roll of [0, 0.25, 0.5, 0.75, 1]) {
      assert.equal(serveWithRoll(shot, roll).reason, 'DOUBLE BOUNCE', `${shot} with roll ${roll}`);
    }
  }
});

test('backspin pulls the ball down off the front wall', () => {
  const offWall = (spin) => {
    const match = createMatch(OPPONENTS[0]);
    serve(match);
    Object.assign(match.ball, { x: 3, y: 0.05, z: 1.5, vx: 0, vy: -10, vz: 0, spin });
    step(match);
    return match.ball.vz;
  };
  assert.ok(offWall(3) < offWall(0) - 0.5);
});

function afterRally(score) {
  const match = createMatch(OPPONENTS[0]);
  match.score = score;
  Object.assign(match, { phase: 'point', winner: score[0] > score[1] ? YOU : BOT, timer: 0 });
  step(match);
  return match.phase;
}

test('the first to 11 wins, for every opponent', () => {
  assert.equal(WIN_SCORE, 11);
  assert.equal(afterRally([10, 8]), 'serve');
  assert.equal(afterRally([11, 8]), 'over');
  assert.equal(afterRally([3, 11]), 'over');
});

test('from 10-10 you have to win by two clear points', () => {
  assert.equal(afterRally([11, 10]), 'serve');
  assert.equal(afterRally([10, 11]), 'serve');
  assert.equal(afterRally([12, 11]), 'serve');
  assert.equal(afterRally([12, 10]), 'over');
  assert.equal(afterRally([10, 12]), 'over');
  assert.equal(afterRally([15, 13]), 'over');
});

function loseRallyFrom(score) {
  const match = createMatch(OPPONENTS[0]);
  serve(match);
  match.score = score;
  Object.assign(match.ball, { x: 3, y: 0.05, z: 0.3, vx: 0, vy: -10, vz: 0 });
  step(match);
  return match;
}

test('reaching 10-10 starts a tie-break with a longer pause', () => {
  const tied = loseRallyFrom([10, 9]);
  assert.deepEqual(tied.score, [10, 10]);
  assert.ok(isTieBreak(tied));
  const normal = loseRallyFrom([9, 8]);
  assert.ok(!isTieBreak(normal));
  assert.ok(tied.timer > normal.timer);
});

test('the tie-break only announces itself once', () => {
  assert.ok(!isTieBreak(loseRallyFrom([11, 10])));
  assert.ok(!isTieBreak(loseRallyFrom([10, 8])));
});

test('stars depend on points conceded', () => {
  const match = createMatch(OPPONENTS[8]);
  match.score = [11, 3];
  assert.equal(starsFor(match), 3);
  match.score = [11, 7];
  assert.equal(starsFor(match), 2);
  match.score = [11, 9];
  assert.equal(starsFor(match), 1);
});

test('progress opens levels, reports unlocks and survives a reload', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const progress = new Progress(storage);
  assert.equal(progress.isLevelOpen(1), false);

  const unlocked = progress.recordClear(0, 2, 500);
  assert.deepEqual(unlocked.map((u) => u.id), ['ember']);
  assert.deepEqual(progress.recordClear(0, 3, 100), []);

  const reloaded = new Progress(storage);
  assert.equal(reloaded.isLevelOpen(1), true);
  assert.equal(reloaded.stars(0), 3);
  assert.equal(reloaded.best(0), 500);
  assert.equal(reloaded.isUnlocked(KITS[1]), true);
});

test('unlocking everything opens all levels and items without touching the save', () => {
  const progress = new Progress(null, { unlockAll: true });
  assert.ok(OPPONENTS.every((_, i) => progress.isLevelOpen(i)));
  assert.ok([...KITS, ...THEMES, ...TROPHIES].every((item) => progress.isUnlocked(item)));
  assert.deepEqual(progress.recordClear(0, 2, 5), []);
  assert.equal(progress.totalStars(), 2);
});

test('progress still works without storage or with a corrupt save', () => {
  assert.equal(new Progress(null).totalStars(), 0);
  const corrupt = { getItem: () => '{nope', setItem() { throw new Error('full'); } };
  const progress = new Progress(corrupt);
  progress.recordClear(0, 1, 10);
  assert.equal(progress.stars(0), 1);
});
