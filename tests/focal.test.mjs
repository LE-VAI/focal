// Focal's guarantees, tested without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor, composite, luminance, contrastRatio, pickRing,
  minimumIndicatorArea, outlineArea, meetsFocusArea, travelDuration, minJerk, samplePoints, DEFAULTS,
} from '../src/focal.js';

test('the module imports in plain Node (no DOM at load)', async () => {
  const m = await import('../src/focal.js');
  assert.equal(typeof m.Focal, 'function');
});

test('parseColor reads hex, comma rgb, space rgb with alpha, and transparent', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('#0a0b0c'), [10, 11, 12, 1]);
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
  assert.deepEqual(parseColor('rgba(1, 2, 3, 0.5)'), [1, 2, 3, 0.5]);
  assert.deepEqual(parseColor('rgb(1 2 3 / 0.25)'), [1, 2, 3, 0.25]);
  assert.deepEqual(parseColor('transparent'), [0, 0, 0, 0]);
  assert.equal(parseColor('oklch(0.5 0.1 200)'), null);
});

test('contrast ratio matches the WCAG reference values', () => {
  assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 1e-9);
  assert.equal(contrastRatio([119, 119, 119], [119, 119, 119]), 1);
  // #767676 on white is the classic 4.54:1.
  assert.ok(Math.abs(contrastRatio([118, 118, 118], [255, 255, 255]) - 4.54) < 0.01);
});

test('composite blends alpha over an opaque base', () => {
  assert.deepEqual(composite([255, 255, 255, 0.5], [0, 0, 0, 1]), [127.5, 127.5, 127.5, 1]);
  assert.deepEqual(composite([10, 20, 30, 1], [200, 200, 200, 1]), [10, 20, 30, 1]);
});

test('pickRing keeps at least 3:1 against the background under the ring, on every surface', () => {
  const surfaces = {
    dark: [[1, 1, 2], [18, 18, 22]],
    light: [[251, 251, 252], [255, 255, 255]],
    azureButtonOnDark: [[10, 10, 12], [10, 148, 255]],
    deepAzureButtonOnLight: [[255, 255, 255], [1, 106, 187]],
    midGrey: [[128, 128, 128], [128, 128, 128]],
  };
  for (const [name, [under, el]] of Object.entries(surfaces)) {
    const pick = pickRing(DEFAULTS.ringColors, [[...under, 1]], [[...el, 1]]);
    assert.ok(pick.meets && pick.ratio >= 3, `${name}: best ring only ${pick.ratio.toFixed(2)}:1 (${pick.color})`);
  }
});

test('pickRing prefers, among passing rings, the one that reads best against the element', () => {
  const under = [[255, 255, 255, 1]], fill = [[1, 106, 187, 1]];
  const candidates = ['#0a94ff', '#1a1a1e', '#ffffff'];
  const pick = pickRing(candidates, under, fill);
  const passing = candidates
    .map((c) => ({ c, under: contrastRatio(parseColor(c), under[0]), adj: contrastRatio(parseColor(c), fill[0]) }))
    .filter((s) => s.under >= 3);
  const bestAdjacent = passing.reduce((a, s) => (s.adj > a.adj ? s : a));
  assert.equal(pick.color, bestAdjacent.c);
  assert.ok(pick.ratio >= 3);
  assert.ok(!passing.some((s) => s.c === '#ffffff'), 'white cannot pass on white');
});

test('pickRing keeps the brand ring on dark surfaces when it passes both tests', () => {
  const pick = pickRing(DEFAULTS.ringColors, [[22, 22, 27, 1]], [[18, 18, 22, 1]]);
  assert.equal(pick.color, DEFAULTS.ringColors[0]);
});

test('pickRing falls back to the strongest ring when nothing reaches 3:1', () => {
  const pick = pickRing(['#ffffff', '#f0f0f0'], [[250, 250, 250, 1]]);
  assert.equal(pick.meets, false);
  assert.equal(pick.color, '#f0f0f0');
});

test('the default outline meets the SC 2.4.13 area floor for every component size', () => {
  for (const [w, h] of [[24, 24], [44, 44], [120, 44], [600, 32], [1, 200], [300, 300]]) {
    assert.ok(meetsFocusArea(w, h, DEFAULTS.ringWidth, DEFAULTS.ringOffset), `${w}x${h} fails`);
  }
  // And a 1 px ring with no offset does not, so the check can fail.
  assert.equal(meetsFocusArea(120, 44, 1, 0), false);
});

test('area math: a 2px ring flush with the edge equals the 2px perimeter plus its corners', () => {
  const w = 150, h = 75;
  assert.equal(minimumIndicatorArea(w, h), 900);
  assert.equal(outlineArea(w, h, 2, 0), (w + 4) * (h + 4) - w * h);
});

test('sweep duration grows with distance and stays inside 240-460 ms', () => {
  assert.equal(travelDuration(0), 240);
  assert.ok(travelDuration(800) > travelDuration(300));
  assert.equal(travelDuration(10000), 460);
});

test('minJerk starts and ends at rest and is symmetric', () => {
  assert.equal(minJerk(0), 0);
  assert.equal(minJerk(1), 1);
  assert.equal(minJerk(0.5), 0.5);
  assert.equal(minJerk(-1), 0);
  assert.equal(minJerk(2), 1);
  // Velocity is near zero at both ends: no snap leaving or arriving.
  assert.ok(minJerk(0.02) < 0.001 && 1 - minJerk(0.98) < 0.001);
  for (let t = 0; t < 1; t += 0.05) assert.ok(minJerk(t + 0.05) >= minJerk(t));
});

test('no glow: the defaults carry no trail or bloom option', () => {
  assert.equal('trail' in DEFAULTS, false);
  assert.equal('bloom' in DEFAULTS, false);
  assert.equal(DEFAULTS.sweep, true);
});

test('samplePoints covers the rect with a 3x3 grid inside its edges', () => {
  const pts = samplePoints({ left: 0, top: 0, width: 100, height: 40 });
  assert.equal(pts.length, 9);
  assert.ok(pts.every((p) => p.x > 0 && p.x < 100 && p.y > 0 && p.y < 40));
});
