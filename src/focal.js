/*
  Focal: keyboard focus as light.

  Two parts, and no glow anywhere:

  1. A real outline, always. Its colour is chosen by measuring contrast against
     the background the outline actually sits on, so it keeps at least 3:1
     (WCAG 2.2 SC 2.4.13 Focus Appearance) on any surface.
  2. Real light. With Sill on the page, the lamp travels to the focused control
     and the control lifts toward it: its shadow lengthens, its rim catches,
     its face takes the highlight. The light is the page's own light, not an
     effect drawn over it. Reduced motion places the lamp without travel.

  It also checks the focused element is not hidden under sticky or fixed
  author content (SC 2.4.11 / 2.4.12) and scrolls it clear when it is.

  Focal never moves focus, never changes tab order, and draws nothing that can
  be clicked.
*/

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ */
/* Pure helpers (exported, tested without a DOM)                        */
/* ------------------------------------------------------------------ */

/** Parse rgb()/rgba() (comma or space syntax) or #rgb/#rrggbb into [r,g,b,a] with r,g,b 0..255. */
export function parseColor(str) {
  const s = String(str || '').trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((x) => !Number.isFinite(x))) return null;
  const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
  return [parts[0], parts[1], parts[2], a];
}

/** Alpha-composite colour `top` over opaque colour `under`. */
export function composite(top, under) {
  const a = top[3] ?? 1;
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
}

/** WCAG 2.x relative luminance of an sRGB colour (0..255 channels). */
export function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Pick the ring colour.
 *
 * `under` are the backgrounds the ring's own pixels sit on (with an outline
 * offset, that is only the parent's background). SC 2.4.13 measures exactly
 * those pixels between the focused and unfocused states, so 3:1 against them
 * is the requirement. `adjacent` (the element's own fill) is a preference.
 * Candidates are in order of preference (the brand ring first): the first one
 * that meets the requirement and also reads at 3:1 against the element wins;
 * failing that, the passing one that reads best against the element; failing
 * that, the strongest one under the ring.
 *
 * Returns { color, ratio, adjacentRatio, meets, index }.
 */
export function pickRing(candidates, under, adjacent = []) {
  const scored = candidates.map((c, index) => {
    const col = typeof c === 'string' ? parseColor(c) : c;
    if (!col) return null;
    const ratio = Math.min(...under.map((b) => contrastRatio(col, b)));
    const adjacentRatio = adjacent.length ? Math.min(...adjacent.map((b) => contrastRatio(col, b))) : Infinity;
    return { color: c, ratio, adjacentRatio, meets: ratio >= 3, index };
  }).filter(Boolean);
  const passing = scored.filter((s) => s.meets);
  const both = passing.find((s) => s.adjacentRatio >= 3);
  if (both) return both;
  if (passing.length) {
    return passing.reduce((best, s) => (s.adjacentRatio > best.adjacentRatio + 1e-9 ? s : best));
  }
  return scored.reduce((best, s) => (s.ratio > best.ratio ? s : best));
}

/**
 * SC 2.4.13 minimum area: a 2 CSS px thick perimeter of the unfocused component,
 * here w x h (the bounding box, which is never longer than the true perimeter).
 */
export function minimumIndicatorArea(w, h) {
  return 2 * (2 * w + 2 * h);
}

/** Area of a solid outline of `width` px drawn `offset` px outside a w x h box. */
export function outlineArea(w, h, width, offset) {
  const ow = w + 2 * (offset + width), oh = h + 2 * (offset + width);
  const iw = w + 2 * offset, ih = h + 2 * offset;
  return ow * oh - iw * ih;
}

/** True when a solid outline of this width meets the SC 2.4.13 area floor for a w x h component. */
export function meetsFocusArea(w, h, width, offset) {
  return outlineArea(w, h, width, offset) >= minimumIndicatorArea(w, h);
}

/** Sweep duration in ms for a light move of `dist` CSS px: long enough to follow, never long enough to wait for. */
export function travelDuration(dist) {
  return Math.round(clamp(200 + dist * 0.2, 240, 460));
}

/** Minimum-jerk easing: how a hand moves a lamp, with no snap at either end. */
export function minJerk(t) {
  const u = clamp(t, 0, 1);
  return u * u * u * (10 - 15 * u + 6 * u * u);
}

/** Sample points across a rect (a 3x3 grid inset 15%) used to test for obscuring content. */
export function samplePoints(r) {
  const out = [];
  for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) out.push({ x: r.left + r.width * fx, y: r.top + r.height * fy });
  return out;
}

/* ------------------------------------------------------------------ */
/* Focal                                                                */
/* ------------------------------------------------------------------ */

export const DEFAULTS = {
  ringWidth: 2,
  ringOffset: 3,
  // Ring candidates, tried in order of preference; the best worst-case contrast wins.
  // Designesy identity v1: Azure is the focus ring on dark, Deep Azure on light; white and ink are fallbacks.
  ringColors: ['#0a94ff', '#016abb', '#ffffff', '#1a1a1e'],
  lift: 12, // px of extra elevation for the focused element (with Sill)
  followLight: true, // with Sill: the light follows keyboard focus
  sweep: true, // with Sill: the light travels to the new focus instead of jumping
  lightOffset: [-60, -120], // with Sill: where the lamp sits relative to the control's centre, px
  fixObscured: true, // scroll focus clear of sticky/fixed content that hides it
  warnObscured: true,
};

export class Focal {
  constructor({ root = document, sill = null, ...opts } = {}) {
    this.doc = root.ownerDocument || root;
    this.win = this.doc.defaultView;
    this.sill = sill;
    this.opts = { ...DEFAULTS, ...opts };
    this.prev = null; // { x, y, rect } of the last focused element
    this.current = null;
    this.keyboard = false;
    this.reduced = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this.forced = this.win.matchMedia('(forced-colors: active)');
    this.lifted = null;
    this.savedFollow = null;
    this._mount();
    this._bind();
  }

  _mount() {
    const d = this.doc;
    d.documentElement.classList.add('focal');
    d.documentElement.style.setProperty('--focal-ring-width', `${this.opts.ringWidth}px`);
    d.documentElement.style.setProperty('--focal-ring-offset', `${this.opts.ringOffset}px`);
  }

  _bind() {
    this.abort = new AbortController();
    const sig = { signal: this.abort.signal, capture: true };
    const d = this.doc;
    d.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') this.keyboard = true;
    }, sig);
    d.addEventListener('pointerdown', () => { this.keyboard = false; }, sig);
    // Browsers send pointermove without real movement (after layout or scroll changes under a
    // resting mouse). Only real movement hands the light back to the pointer.
    d.addEventListener('pointermove', (e) => {
      const last = this.lastPointer;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 3) return;
      if (last) this._pointerResumed();
    }, { signal: this.abort.signal, passive: true });
    d.addEventListener('focusin', (e) => this._onFocus(e.target), sig);
    d.addEventListener('focusout', (e) => this._onBlur(e.target, e.relatedTarget), sig);
    // The light is placed in viewport space; keep it over the focused control as the page scrolls.
    this.win.addEventListener('scroll', () => { if (this.aimed && this.current) this._aim(this._snap(this.current), true); }, { signal: this.abort.signal, passive: true });
  }

  destroy() {
    this.abort.abort();
    this._stopSweep();
    this._unlift();
    this.doc.documentElement.classList.remove('focal');
  }

  /* ---------------- focus handling ---------------- */

  /**
   * The element people see for this focus. A visually hidden native input can
   * name its visible part with data-focal-target (a selector resolved inside its
   * parent), so the ring and the light land there.
   */
  _visual(el) {
    const sel = el.getAttribute('data-focal-target');
    return (sel && el.parentElement && el.parentElement.querySelector(sel)) || el;
  }

  _onFocus(target) {
    if (!(target instanceof this.win.Element) || target === this.doc.body) return;
    const visible = target.matches(':focus-visible');
    const el = this._visual(target);
    this.current = el;
    this._setRing(el, target);
    if (!visible) { this.prev = this._snap(el); return; }

    // Let the browser finish scrolling the element into view before measuring.
    this.win.requestAnimationFrame(() => {
      if (this.current !== el) return;
      if (this.opts.fixObscured || this.opts.warnObscured) this._checkObscured(el, target);
      const to = this._snap(el);
      this._lift(el);
      this._lightFollow(to);
      el.dispatchEvent(new CustomEvent('focal:move', { bubbles: true, detail: { from: this.prev?.rect || null, to: to.rect } }));
      this.prev = to;
    });
  }

  _onBlur(el, next) {
    if (!next) { this._unlift(); this.current = null; }
  }

  _snap(el) {
    const r = el.getBoundingClientRect();
    return { el, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---------------- the outline ---------------- */

  _setRing(el, focused = el) {
    const w = this.win;
    const cs = w.getComputedStyle(el);
    const own = parseColor(cs.backgroundColor) || [0, 0, 0, 0];
    const behind = this._backgroundBehind(el.parentElement);
    const elementBg = composite(own, behind);
    // The ring sits outside the element, on the parent's background: that contrast is
    // required. Reading well against the element itself is preferred.
    const pick = pickRing(this.opts.ringColors, [behind], [elementBg]);
    el.style.setProperty('--focal-ring', pick.color);
    if (focused !== el) focused.style.setProperty('--focal-ring', pick.color);
    el.dataset.focalRatio = pick.ratio.toFixed(2);
    if (!pick.meets) console.warn(`[focal] no ring colour reaches 3:1 here (best ${pick.ratio.toFixed(2)}:1); add one to ringColors`, el);
  }

  /** The opaque colour painted behind an element: composite ancestor backgrounds up to the root. */
  _backgroundBehind(start) {
    const layers = [];
    for (let n = start; n && n.nodeType === 1; n = n.parentElement) {
      const c = parseColor(this.win.getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1][3] < 1) {
      const rootBg = parseColor(this.win.getComputedStyle(this.doc.documentElement).backgroundColor);
      if (rootBg && rootBg[3] > 0) base = composite(rootBg, base);
    }
    for (let i = layers.length - 1; i >= 0; i--) base = composite(layers[i], base);
    return base;
  }

  /* ---------------- light (Sill) ---------------- */

  _lift(el) {
    this._unlift();
    if (!this.sill || !this.opts.lift) return;
    const s = this.sill;
    // Only an element that is itself lit lifts; a field inside a card leaves the card alone.
    const it = s.items && el.matches('[data-lit]') && s.items.get(el);
    if (!it) return;
    this.lifted = { it, depth: it.depth };
    if (typeof s.setElevation === 'function') s.setElevation(it.el, it.depth + this.opts.lift);
    else { it.depth += this.opts.lift; s.refresh?.(); }
  }

  _unlift() {
    if (!this.lifted) return;
    const { it, depth } = this.lifted;
    if (typeof this.sill?.setElevation === 'function') this.sill.setElevation(it.el, depth);
    else { it.depth = depth; this.sill?.refresh?.(); }
    this.lifted = null;
  }

  _lightFollow(to) {
    const s = this.sill;
    if (!s || !this.opts.followLight || !this.keyboard) return;
    if (this.savedFollow === null) this.savedFollow = s.params.follow;
    if (s.params.follow) s.set({ follow: false });
    this._aim(to, !this.opts.sweep || this.reduced.matches || this.forced.matches);
  }

  /**
   * Put the lamp above and slightly left of the control, so its shadow falls down
   * and away. With a sweep, the lamp travels there on a minimum-jerk path and the
   * page's shadows swing with it; without one it is simply there.
   */
  _aim(to, instant) {
    const s = this.sill;
    const [ox, oy] = this.opts.lightOffset;
    const x = to.x + ox, y = Math.max(24, to.y + oy);
    this.aimed = true;
    this._stopSweep();
    const from = s.light;
    const dist = Math.hypot(x - from.x, y - from.y);
    if (instant || dist < 4 || this.doc.hidden) { s.moveTo(x, y, true); return; }
    const dur = travelDuration(dist);
    const t0 = this.win.performance.now();
    const step = (now) => {
      const k = minJerk((now - t0) / dur);
      s.moveTo(from.x + (x - from.x) * k, from.y + (y - from.y) * k, true);
      this.sweepId = k < 1 ? this.win.requestAnimationFrame(step) : 0;
    };
    this.sweepId = this.win.requestAnimationFrame(step);
    // Frames can be throttled (a background tab, a busy main thread); the lamp still arrives.
    this.sweepEnd = this.win.setTimeout(() => { this._stopSweep(); s.moveTo(x, y, true); }, dur + 50);
  }

  _stopSweep() {
    if (this.sweepId) this.win.cancelAnimationFrame(this.sweepId);
    if (this.sweepEnd) this.win.clearTimeout(this.sweepEnd);
    this.sweepId = this.sweepEnd = 0;
  }

  _pointerResumed() {
    if (this.savedFollow === null || !this.sill) return;
    this._stopSweep();
    this.aimed = false;
    this.sill.set({ follow: this.savedFollow });
    this.savedFollow = null;
    this.keyboard = false;
  }

  /* ---------------- not obscured (SC 2.4.11 / 2.4.12) ---------------- */

  _checkObscured(el, focused = el) {
    const r = el.getBoundingClientRect();
    const vw = this.win.innerWidth, vh = this.win.innerHeight;
    const pts = samplePoints(r).filter((p) => p.x >= 0 && p.x < vw && p.y >= 0 && p.y < vh);
    if (!pts.length) return;
    let hidden = 0, cover = null;
    for (const p of pts) {
      const hit = this.doc.elementFromPoint(p.x, p.y);
      // The visible part and the focused element (a hidden native input can sit over it) both count as itself.
      if (!hit || [el, focused].some((n) => hit === n || n.contains(hit) || hit.contains(n))) continue;
      hidden++;
      cover = cover || this._fixedAncestor(hit);
    }
    if (!hidden) return;
    const entirely = hidden === pts.length;
    const detail = { element: el, fraction: hidden / pts.length, entirely, cover };
    if (this.opts.warnObscured) console.warn(`[focal] focused element ${entirely ? 'entirely' : 'partly'} hidden by ${cover ? cover.tagName.toLowerCase() + (cover.className ? '.' + String(cover.className).split(' ')[0] : '') : 'other content'} (WCAG 2.2 SC ${entirely ? '2.4.11' : '2.4.12'})`, el);
    el.dispatchEvent(new CustomEvent('focal:obscured', { bubbles: true, detail }));
    if (this.opts.fixObscured && cover) {
      const c = cover.getBoundingClientRect();
      // Cover sits at the top: scroll the page up so the element clears its bottom edge.
      if (c.top <= r.top) this.win.scrollBy({ top: -(c.bottom - r.top + 12), behavior: 'instant' });
      else this.win.scrollBy({ top: r.bottom - c.top + 12, behavior: 'instant' });
    }
  }

  _fixedAncestor(n) {
    for (; n && n.nodeType === 1; n = n.parentElement) {
      const p = this.win.getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return n;
    }
    return null;
  }
}
