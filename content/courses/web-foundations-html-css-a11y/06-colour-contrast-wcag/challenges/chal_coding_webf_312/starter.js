/**
 * Check one foreground/background colour pair against WCAG 2.2 contrast rules.
 *
 * Arguments:
 *   - foreground, background  hex colour STRINGS: "#rgb" or "#rrggbb", case-insensitive
 *            ("#777", "#767676", "#FfF"). "#rgb" is shorthand: "#f60" means "#ff6600".
 *            Anything else is invalid and must THROW: "777777" (no #), "#7777", "#77777",
 *            "#gggggg", "red", "rgb(0,0,0)", "", null, a number.
 *            The order does not matter: the lighter colour is always L1 in the formula.
 *   - options  { sizePx, bold, kind }
 *       kind    "text" (1.4.3 / 1.4.6) or "ui" (1.4.11 Non-text Contrast: input borders,
 *               focus indicators, icons). Any other kind is invalid and must THROW.
 *       sizePx  computed font size in CSS px. For kind "text" it must be a finite number > 0,
 *               otherwise THROW. Ignored for kind "ui".
 *       bold    true for bold text; anything else counts as not bold. Ignored for kind "ui".
 *
 * Relative luminance of a colour (WCAG 2.2):
 *   1. each channel 0-255 -> c = value / 255
 *   2. linearise: c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
 *   3. L = 0.2126 * R + 0.7152 * G + 0.0722 * B   (R, G, B are the linearised channels)
 * Contrast ratio = (L1 + 0.05) / (L2 + 0.05), L1 = the LIGHTER colour. From 1 to 21.
 *
 * Returns { ratio, large, aa, aaa }:
 *   - ratio  the contrast ratio rounded to 2 decimals, for display only:
 *            Math.round(ratio * 100) / 100   (4.4781... -> 4.48, 21 -> 21, 1 -> 1)
 *   - large  kind "text": true when sizePx >= 24 (18pt), or when bold is true and
 *            sizePx >= 56 / 3 (14pt, about 18.67px). kind "ui": always false.
 *   - aa     kind "text": ratio >= 4.5, or >= 3 for large text.   kind "ui": ratio >= 3.
 *   - aaa    kind "text": ratio >= 7,   or >= 4.5 for large text. kind "ui": null
 *            (WCAG 2.2 has no enhanced level for non-text contrast).
 * aa and aaa MUST use the UNROUNDED ratio: 4.497... displays as 4.5 but fails 4.5:1.
 *
 * @param {string} foreground
 * @param {string} background
 * @param {{ sizePx?: number, bold?: boolean, kind: "text" | "ui" }} options
 * @returns {{ ratio: number, large: boolean, aa: boolean, aaa: boolean | null }}
 */
function contrastReport(foreground, background, options) {
  // TODO: parse both colours, compute their relative luminance, build the ratio,
  // decide large text, then the AA / AAA flags.
  return { ratio: 1, large: false, aa: false, aaa: false };
}
