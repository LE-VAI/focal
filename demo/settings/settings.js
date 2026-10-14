import { Sill } from 'https://cdn.jsdelivr.net/npm/@designesy/sill@0.1.1/src/sill.js';
import { Focal } from '../../src/focal.js';

const sill = new Sill({
  root: document.body,
  params: { mode: 'lamp', temperature: 3200, intensity: 1.15, ambient: 0.3, shadowLength: 1.4, softness: 0.55, depth: 1.6, material: 1.4, rays: 0.45 },
});
const focal = new Focal({ sill });

window.sill = sill;
window.focal = focal;
