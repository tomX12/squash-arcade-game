// Stars, best scores, unlocks and equipped items, saved on this device.

const KEY = 'rally-rush-v2';

export const KITS = [
  { id: 'classic', name: 'CLASSIC', shirt: '#f4f1de', shorts: '#2d3047' },
  { id: 'ember', name: 'EMBER', shirt: '#ff5a36', shorts: '#40201a', req: { level: 1 } },
  { id: 'frost', name: 'FROST', shirt: '#9be7ff', shorts: '#1f3b63', req: { level: 6 } },
  { id: 'volt', name: 'VOLT', shirt: '#d9f950', shorts: '#2a2150', req: { level: 10 } },
  { id: 'gilded', name: 'GILDED', shirt: '#ffd700', shorts: '#fff4b8', req: { stars: 36 } },
];

export const THEMES = [
  { id: 'auto', name: 'EVENT COURT' },
  { id: 'mint', name: 'MINT SCREEN', req: { level: 3 } },
  { id: 'tape', name: 'SUNSET TAPE', req: { level: 7 } },
  { id: 'midnight', name: 'MIDNIGHT', req: { stars: 18 } },
];

export const TROPHIES = [
  { id: 'bronze', name: 'BRONZE CUP', color: '#cd7f32', req: { level: 4 } },
  { id: 'silver', name: 'SILVER CUP', color: '#c8d3e0', req: { level: 8 } },
  { id: 'gold', name: 'GOLD CUP', color: '#ffd700', req: { level: 12 } },
  { id: 'platinum', name: 'PERFECT CUP', color: '#b8fff2', req: { stars: 36 } },
];

const ALL = [
  ...KITS.map((item) => ({ ...item, kind: 'KIT' })),
  ...THEMES.map((item) => ({ ...item, kind: 'THEME' })),
  ...TROPHIES.map((item) => ({ ...item, kind: 'TROPHY' })),
];

export function requirementText(item) {
  if (!item.req) return 'UNLOCKED';
  return item.req.level ? `BEAT OPPONENT ${item.req.level}` : `EARN ${item.req.stars} STARS`;
}

export class Progress {
  constructor(storage = safeStorage(), { unlockAll = false } = {}) {
    this.storage = storage;
    this.unlockAll = unlockAll;
    this.data = { stars: [], best: [], kit: 'classic', theme: 'auto', muted: false };
    try {
      Object.assign(this.data, JSON.parse(storage?.getItem(KEY)) ?? {});
    } catch {
      // Unreadable save: start fresh.
    }
  }

  save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Private mode or full storage: the game still plays, it just won't remember.
    }
  }

  stars(i) {
    return this.data.stars[i] ?? 0;
  }

  best(i) {
    return this.data.best[i] ?? 0;
  }

  totalStars() {
    return this.data.stars.reduce((sum, n) => sum + (n ?? 0), 0);
  }

  isLevelOpen(i) {
    return this.unlockAll || i === 0 || this.stars(i - 1) > 0;
  }

  isUnlocked(item) {
    if (this.unlockAll || !item.req) return true;
    if (item.req.level) return this.stars(item.req.level - 1) > 0;
    return this.totalStars() >= item.req.stars;
  }

  // Records a clear and returns anything it newly unlocked.
  recordClear(i, stars, score) {
    const before = ALL.filter((item) => this.isUnlocked(item));
    this.data.stars[i] = Math.max(this.stars(i), stars);
    this.data.best[i] = Math.max(this.best(i), score);
    this.save();
    return ALL.filter((item) => this.isUnlocked(item) && !before.some((b) => b.id === item.id));
  }

  equip(key, id) {
    this.data[key] = id;
    this.save();
  }
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
