// Computer opponent. It reads the same ball flight the player sees, then
// `reaction`, `speed` and `skill` decide how well it gets there.

import {
  COURT, T_SPOT, canHit, inTheWay, serve, swing,
} from './physics.js';

const ARRIVED = 0.12;
// Start moving out of the rival's way this far from them, before the referee would call it.
const CLEAR_EARLY = 2;

export function createBrain() {
  return { plan: null, lastRally: -1, delay: 0 };
}

function choosePoint(match, player, delay, speed) {
  const reachable = match.path.filter((p) => p.z < 1.6 && (p.bounces >= 1 || p.z < 1.2));
  const inTime = reachable.find((p) => {
    const distance = Math.hypot(p.x - player.x, p.y - player.y);
    return distance / speed <= p.t - delay;
  });
  return inTime ?? reachable[reachable.length - 1] ?? null;
}

function chooseShot(match, i) {
  const rival = match.players[1 - i];
  const roll = match.random();
  if (rival.y > 6.5 && roll < 0.3) return 'drop';
  if (rival.y < 4 && roll < 0.4) return 'lob';
  return roll < 0.8 ? 'drive' : 'lob';
}

function heightError(match, skill) {
  if (match.random() < skill) return 0;
  return -0.6 - match.random() * 0.9;
}

// Step sideways out of the rival's line to the ball, away from a nearby side wall.
function clearTarget(player, way) {
  let { x, y } = way.clear;
  const out = player.x + x;
  if (out < 0.5 || out > COURT.width - 0.5) {
    x = -x;
    y = -y;
  }
  return { x: player.x + x, y: player.y + y };
}

function walkTo(player, target) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance < ARRIVED) {
    player.mx = 0;
    player.my = 0;
    return;
  }
  player.mx = dx / distance;
  player.my = dy / distance;
}

export function updateBot(match, i, brain, dt, profile = match.opponent) {
  const player = match.players[i];

  if (match.phase === 'serve') {
    if (match.server !== i) {
      brain.plan = null;
      return;
    }
    match.timer -= dt;
    if (match.timer <= 0) serve(match, match.random() < 0.3 ? 'lob' : 'serve');
    return;
  }
  if (match.phase !== 'rally') {
    player.mx = 0;
    player.my = 0;
    return;
  }

  if (match.toHit !== i) {
    brain.plan = null;
    brain.lastRally = -1;
    const way = inTheWay(match, CLEAR_EARLY);
    walkTo(player, way ? clearTarget(player, way) : T_SPOT);
    return;
  }

  if (brain.lastRally !== match.rally) {
    brain.lastRally = match.rally;
    brain.plan = null;
    brain.delay = profile.reaction;
  }
  if (brain.delay > 0) {
    brain.delay -= dt;
    return;
  }

  // Path times start when the ball was struck, so count from now.
  brain.plan ??= choosePoint(match, player, profile.reaction, profile.speed);
  if (brain.plan) walkTo(player, brain.plan);

  const { ball } = match;
  const urgent = match.bounces >= 1 && ball.z < 0.5;
  if (canHit(match, i) && (urgent || (ball.z < 1.6 && match.bounces === (brain.plan?.bounces ?? 1)))) {
    const rival = match.players[1 - i];
    player.aim = rival.x < COURT.width / 2 ? 1 : -1;
    swing(match, i, chooseShot(match, i), heightError(match, profile.skill));
  }
}
