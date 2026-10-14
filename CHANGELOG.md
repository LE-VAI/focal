# Changelog

## 0.1.1 (2026-10-13)

Maintenance; the library code is unchanged.

- CI: a brand gate (`tests/brand.test.mjs`) fails on any retired Designesy colour
  in any text file, the same gate Sill runs.
- Demos: the light comes from Sill 0.1.2, so the live demos and Sill's own run the
  same release.
- README: the no-build quick start pins 0.1.1.

## 0.1.0

First release.

- A solid focus outline whose colour is picked by measured contrast against the
  surface under it (WCAG 2.2 SC 2.4.13), preferring your first colour when it
  also reads against the element. `focal.refresh()` re-measures after a theme change.
- With Sill: the page's lamp travels to the focused control on a minimum-jerk
  path, and the control rises toward it and settles back when focus leaves.
  No glow, halo or trail is drawn; the emphasis is the light itself.
- Focus hidden under sticky or fixed content is detected (SC 2.4.11 and 2.4.12),
  reported in the console and as a `focal:obscured` event, and scrolled clear.
- Reduced motion places the lamp without travel; forced colours use `Highlight`.
