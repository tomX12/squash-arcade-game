// Reports every finger separately, so one thumb can move while the other swings.
// Arrow keys and Z, X, C work for desktop testing.

const TAP_MAX_MOVE = 10;
const TAP_MAX_MS = 350;
const KEY_SHOTS = { ' ': 'drive', z: 'drive', x: 'lob', c: 'drop' };

export const keys = { left: false, right: false, up: false, down: false };

export function bindInput(el, toLogical, { first, press, slide, release, tap, keyShot, escape }) {
  const pointers = new Map();

  el.addEventListener('pointerdown', (e) => {
    first();
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, time: e.timeStamp });
    const at = toLogical(e);
    press(e.pointerId, at.x, at.y);
  });

  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const at = toLogical(e);
    slide(e.pointerId, at.x, at.y);
  });

  el.addEventListener('pointerup', (e) => {
    const start = pointers.get(e.pointerId);
    if (!start) return;
    pointers.delete(e.pointerId);
    release(e.pointerId);
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved < TAP_MAX_MOVE && e.timeStamp - start.time < TAP_MAX_MS) {
      const at = toLogical(e);
      tap(at.x, at.y);
    }
  });

  el.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    release(e.pointerId);
  });

  const setKey = (e, down) => {
    const name = e.key.replace('Arrow', '').toLowerCase();
    if (!(name in keys)) return false;
    keys[name] = down;
    return true;
  };

  addEventListener('keydown', (e) => {
    const shot = KEY_SHOTS[e.key.toLowerCase()];
    if (setKey(e, true)) e.preventDefault();
    else if (shot) {
      e.preventDefault();
      first();
      if (!e.repeat) keyShot(shot);
    } else if (e.key === 'Escape') escape();
  });

  addEventListener('keyup', (e) => setKey(e, false));

  // Stop iPhone Safari scrolling, pinching or double-tap zooming the page.
  const block = (e) => e.preventDefault();
  document.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('gesturestart', block);
  document.addEventListener('dblclick', block);
}
