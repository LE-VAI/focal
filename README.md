# Focal

Keyboard focus as light.

The focused control gets a real outline whose colour is chosen by measuring
contrast against the surface it sits on. With [Sill](https://github.com/LE-VAI/sill)
on the page, the page's own lamp travels to whatever has focus and the control
lifts toward it: its shadow lengthens, its edges catch the light, and the shadows
across the page swing as the lamp moves, so the eye follows a jump. Nothing is
drawn on top. No glow, no halo: the emphasis is the light itself, so keyboard
users get the same physical interface pointer users do.

```js
import '@designesy/focal/focal.css';
import { Focal } from '@designesy/focal';

new Focal();              // on its own
new Focal({ sill });      // with Sill: focus lifts and the light follows
```

```bash
npm install @designesy/focal
```

## What it guarantees

- **A real outline, always.** The light is added on top of a solid outline and
  can be removed without losing the indicator. The default 2 px
  outline at a 3 px offset meets the area floor of WCAG 2.2 SC 2.4.13 Focus
  Appearance for any component size (tested).
- **3:1 where it counts.** SC 2.4.13 measures the indicator's own pixels between
  the focused and unfocused states. Drawn outside the element, those pixels sit on
  the parent's background, so Focal picks the ring colour that keeps at least 3:1
  there. Among colours that pass, it prefers your first choice when that also reads
  at 3:1 against the element itself. On a blue button on white, that switches the
  ring away from blue automatically.
- **Focus is never hidden behind sticky content.** After every move, Focal checks
  whether author content such as a sticky header covers the focused element
  (SC 2.4.11 Focus Not Obscured, and 2.4.12 for partial cover), warns in the
  console, and scrolls it clear.
- **Reduced motion means no travel.** Under `prefers-reduced-motion`, the lamp is
  placed at the new focus without sweeping there.
- **Forced colours means the system's colours.** In Windows High Contrast and other
  forced-colour modes, the outline uses `Highlight` and the lamp does not travel.
- **It changes nothing about focus.** Focal never moves focus, never changes tab
  order, and draws nothing that can be clicked. It only shows where focus already is.

## Options

| Option | Default | Controls |
|---|---|---|
| `sill` | `null` | a Sill instance to lift toward and steer |
| `ringWidth` | `2` | outline width in px |
| `ringOffset` | `3` | outline offset in px |
| `ringColors` | `['#0a94ff', '#016abb', '#ffffff', '#1a1a1e']` | ring colours, in order of preference |
| `lift` | `12` | extra elevation for a focused lit element (Sill) |
| `followLight` | `true` | the light follows keyboard focus (Sill) |
| `sweep` | `true` | the lamp travels to the new focus instead of jumping (Sill) |
| `lightOffset` | `[-60, -120]` | where the lamp sits relative to the control's centre, px (Sill) |
| `fixObscured` | `true` | scroll focus clear of covering content |
| `warnObscured` | `true` | console warning when focus is covered |

Visually hidden native inputs (a custom switch or segmented control) can name
the part people see, so the ring and the light land there:

```html
<label class="switch">
  <input type="checkbox" role="switch" data-focal-target=".switch-track">
  <span class="switch-track"></span>
</label>
```

Call `focal.refresh()` after a theme change so the ring is measured against the new surfaces.

Events: `focal:move` (`detail.from`, `detail.to`) and `focal:obscured`
(`detail.fraction`, `detail.entirely`, `detail.cover`) bubble from the focused
element.

## Demo

`demo/settings/` is a settings page with a sticky header, a skip link, and
controls spread across the page. Press Tab.

```bash
python -m http.server 4742
```

Then open `http://localhost:4742/demo/settings/`.

## Browser support

Focal needs nothing beyond `:focus-visible` and `requestAnimationFrame`. Tested in Chrome 154 and Firefox 152 on Windows, with no console errors. Safari is not yet tested.

## License

MIT © 2026 LE-VAI. Part of the Designesy stack.
