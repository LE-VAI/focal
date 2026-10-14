/*
  Focal: keyboard focus as light.

  Three layers, from the floor up:

  1. A real outline, always. Its colour is chosen by measuring contrast against
     the background the outline actually sits on, so it keeps at least 3:1
     (WCAG 2.2 SC 2.4.13 Focus Appearance) on any surface. Everything else is
     added on top of it and can be removed without losing the indicator.
  2. A trail. When focus moves, a short streak of light travels from where focus
     was to where it is, so the eye can follow a jump. Transform and opacity
     only, so the motion runs off the main thread. Reduced motion turns it into
     a 150 ms fade at the destination.
  3. Light. With Sill on the page, the focused element lifts toward the light and
     the light follows keyboard focus, so keyboard users get the same physical
     interface pointer users do.

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

/** Trail duration in ms for a jump of `dist` CSS px: long enough to follow, never long enough to wait for. */
export function travelDuration(dist) {
  return Math.round(clamp(200 + dist * 0.2, 240, 460));
}

/**
 * Where the trail enters the viewport when focus comes from somewhere off
 * screen: the point on the viewport edge along the line from the target back
 * toward `from`. Returns {x, y}.
 */
export function edgeEntry(from, to, vw, vh, inset = 8) {
  const dx = from.x - to.x, dy = from.y - to.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: to.x, y: inset };
  const ts = [];
  if (dx > 0) ts.push((vw - inset - to.x) / dx);
  if (dx < 0) ts.push((inset - to.x) / dx);
  if (dy > 0) ts.push((vh - inset - to.y) / dy);
  if (dy < 0) ts.push((inset - to.y) / dy);
  const t = Math.min(...ts.filter((v) => v > 0), 1);
  return { x: to.x + dx * t, y: to.y + dy * t };
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
  trail: true,
  bloom: true,
  lift: 10, // px of extra elevation for the focused element (with Sill)
  followLight: true, // with Sill: the light follows keyboard focus
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
    this.layer = d.createElement('div');
    this.layer.className = 'focal-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.comet = d.createElement('div');
    this.comet.className = 'focal-comet';
    this.tail = d.createElement('div');
    this.tail.className = 'focal-tail';
    this.bloomEl = d.createElement('div');
    this.bloomEl.className = 'focal-bloom';
    this.layer.append(this.tail, this.comet, this.bloomEl);
    d.body.append(this.layer);
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
    this.win.addEventListener('scroll', () => { if (this.current) this._placeBloom(this.current, false); }, { signal: this.abort.signal, passive: true });
  }

  destroy() {
    this.abort.abort();
    this._unlift();
    this.layer.remove();
    this.doc.documentElement.classList.remove('focal');
  }

  /* ---------------- focus handling ---------------- */

  /**
   * The element people see for this focus. A visually hidden native input can
   * name its visible part with data-focal-target (a selector resolved inside its
   * parent), so the ring, bloom and trail land there.
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
    if (!visible) { this._hide(); this.prev = this._snap(el); return; }

    // Let the browser finish scrolling the element into view before measuring.
    this.win.requestAnimationFrame(() => {
      if (this.current !== el) return;
      if (this.opts.fixObscured || this.opts.warnObscured) this._checkObscured(el, target);
      const to = this._snap(el);
      this._travel(this.prev, to);
      this._placeBloom(el, true);
      this._lift(el);
      this._lightFollow(to);
      el.dispatchEvent(new CustomEvent('focal:move', { bubbles: true, detail: { from: this.prev?.rect || null, to: to.rect } }));
      this.prev = to;
    });
  }

  _onBlur(el, next) {
    if (!next) { this._hide(); this._unlift(); this.current = null; }
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

  /* ---------------- motion ---------------- */

  _hide() {
    this.layer.classList.remove('is-on');
  }

  _placeBloom(el, animate) {
    if (!this.opts.bloom || this.forced.matches) return;
    const r = el.getBoundingClientRect();
    const cs = this.win.getComputedStyle(el);
    const off = this.opts.ringOffset + this.opts.ringWidth;
    const b = this.bloomEl;
    b.style.width = `${r.width + off * 2}px`;
    b.style.height = `${r.height + off * 2}px`;
    b.style.borderRadius = `calc(${cs.borderTopLeftRadius} + ${off}px)`;
    b.style.transform = `translate(${r.left - off}px, ${r.top - off}px)`;
    b.style.setProperty('--focal-ring', el.style.getPropertyValue('--focal-ring'));
    this.layer.classList.add('is-on');
    if (animate) {
      const reduced = this.reduced.matches;
      b.animate(reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, scale: '1.06' }, { opacity: 1, scale: '1' }],
      { duration: reduced ? 150 : 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' });
    }
  }

  _travel(from, to) {
    if (!this.opts.trail || !from || this.reduced.matches || this.forced.matches) return;
    const vw = this.win.innerWidth, vh = this.win.innerHeight;
    let a = { x: from.x, y: from.y };
    const onScreen = a.x >= 0 && a.x <= vw && a.y >= 0 && a.y <= vh;
    if (!onScreen) a = edgeEntry(a, to, vw, vh);
    const dx = to.x - a.x, dy = to.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return;
    const dur = travelDuration(dist);
    const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const color = to.el.style.getPropertyValue('--focal-ring');
    this.comet.style.setProperty('--focal-ring', color);
    this.tail.style.setProperty('--focal-ring', color);
    this.comet.animate([
      { transform: `translate(${a.x}px, ${a.y}px)`, opacity: 0 },
      { transform: `translate(${a.x + dx * 0.15}px, ${a.y + dy * 0.15}px)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${to.x}px, ${to.y}px)`, opacity: 0.9, offset: 0.85 },
      { transform: `translate(${to.x}px, ${to.y}px)`, opacity: 0 },
    ], { duration: dur, easing: ease, fill: 'both' });
    // The tail is a gradient bar that rides behind the comet's head, stretches along the
    // path, then draws in after it so the streak shrinks into the destination.
    const len = Math.min(dist * 0.8, 320);
    this.tail.style.width = `${len}px`;
    // The bar's right end is its head. It shares the comet's keyframe timing, so the
    // head stays on the comet; after arrival the streak draws into the destination.
    const at = (f) => `translate(${a.x + dx * f - len}px, ${a.y + dy * f - 3}px) rotate(${angle}deg)`;
    this.tail.animate([
      { transform: `${at(0)} scaleX(0.05)`, opacity: 0 },
      { transform: `${at(0.15)} scaleX(0.7)`, opacity: 1, offset: 0.15 },
      { transform: `${at(1)} scaleX(1)`, opacity: 0.9, offset: 0.85 },
      { transform: `${at(1)} scaleX(0.05)`, opacity: 0 },
    ], { duration: dur, easing: ease, fill: 'both' });
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
    // Above and slightly left of the control, so its shadow falls down and away.
    s.moveTo(to.x - 60, Math.max(24, to.y - 120));
  }

  _pointerResumed() {
    if (this.savedFollow === null || !this.sill) return;
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
