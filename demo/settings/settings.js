import { Sill } from 'https://cdn.jsdelivr.net/npm/@designesy/sill@0.1.1/src/sill.js';
import { Focal } from '../../src/focal.js';

const sill = new Sill({
  root: document.body,
  // Neutral daylight, no haze: the light reads as light, not as a tint or a glow.
  params: { mode: 'lamp', temperature: 5600, intensity: 1.15, ambient: 0.34, shadowLength: 1.4, softness: 0.5, depth: 1.6, material: 1.4, rays: 0 },
});
const focal = new Focal({ sill });

// The text-size slider is real: its value and a sample line follow it.
const size = document.getElementById('text-size');
const sizeOut = document.getElementById('size-out');
const sample = document.getElementById('size-sample');
const showSize = () => {
  sizeOut.value = `${size.value} px`;
  sample.style.fontSize = `${size.value}px`;
  size.style.setProperty('--fill', `${((size.value - size.min) / (size.max - size.min)) * 100}%`);
};
size.addEventListener('input', showSize);
showSize();

// The theme control is real. System follows the operating system.
const scheme = window.matchMedia('(prefers-color-scheme: light)');
const applyTheme = () => {
  const pick = document.querySelector('input[name=theme]:checked').value;
  const theme = pick === 'system' ? (scheme.matches ? 'light' : 'dark') : pick;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=color-scheme]').content = theme;
  // Designesy identity v1: Azure is the ring on dark, Deep Azure on light.
  focal.opts.ringColors = theme === 'light' ? ['#016abb', '#0a94ff', '#1a1a1e', '#ffffff'] : ['#0a94ff', '#016abb', '#ffffff', '#1a1a1e'];
  // Paper needs more sky fill than a dark room does.
  sill.set({ ambient: theme === 'light' ? 0.62 : 0.34 });
  sill.refresh();
  focal.refresh();
};
for (const r of document.querySelectorAll('input[name=theme]')) r.addEventListener('change', applyTheme);
scheme.addEventListener('change', applyTheme);
applyTheme();

window.sill = sill;
window.focal = focal;
