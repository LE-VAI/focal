import { Sill } from 'https://cdn.jsdelivr.net/npm/@designesy/sill@0.1.1/src/sill.js';
import { Focal } from '../../src/focal.js';

const sill = new Sill({
  root: document.body,
  // Neutral daylight, no haze: the light reads as light, not as a tint or a glow.
  params: { mode: 'lamp', temperature: 5600, intensity: 1.15, ambient: 0.34, shadowLength: 1.4, softness: 0.5, depth: 1.6, material: 1.4, rays: 0 },
});
const focal = new Focal({ sill });

window.sill = sill;
window.focal = focal;
