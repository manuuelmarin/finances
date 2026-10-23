# Appearance

The original bank monogram combines Manuel's M, a pediment and a foundation.
It is an SVG, so it stays crisp in the navigation, favicon and small screens.
The PNG and maskable home-screen icons are generated from the same originals
with `node tools/build-icons.cjs` (requires the Playwright Chromium browser).
The mark fits inside the maskable safe circle. All artwork is local and cached
with the app; no external image requests are needed.

There are 24 explicit themes plus the device preference. Existing theme IDs
remain compatible with saved preferences. The native selector groups the
palettes by essential, professional, nature, classic and contemporary styles.
New palettes live in `web/themes.css`; the live preview uses the actual theme
tokens. The financial increase/decrease colors retain their meaning across
palettes. Themes affect presentation only, never stored records or calculations.

Research references, consulted 2026-10-23:

- [Radix Colors: scale roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale): separate backgrounds, interactive surfaces, borders, solid accents and foreground text.
- [Radix Colors: composing a palette](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette): neutral and accent scales with complementary semantic colors.
- [Atlassian color palette](https://atlassian.design/foundations/color/color-palette/): dedicated neutral ramps for light and dark surfaces.
- [W3C WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): at least 4.5:1 for normal text.

These are original palettes inspired by those role systems, not copies of a
bank's brand. Browser checks measure normal, muted, subtle, positive and
negative text against the actual surfaces, plus primary-button contrast and
the tinted comparison-cell backgrounds. Each required text pair meets 4.5:1.
