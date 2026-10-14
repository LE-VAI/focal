# Changelog

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
