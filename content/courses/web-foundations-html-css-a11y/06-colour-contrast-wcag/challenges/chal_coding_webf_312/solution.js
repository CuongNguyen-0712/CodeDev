/**
 * Reference solution (never shipped to learners).
 */
function contrastReport(foreground, background, options) {
  const a = luminance(foreground);
  const b = luminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const { sizePx, bold, kind } = options ?? {};
  const shown = Math.round(ratio * 100) / 100;

  if (kind === "ui") return { ratio: shown, large: false, aa: ratio >= 3, aaa: null };
  if (kind !== "text") throw new TypeError(`Unknown kind: ${JSON.stringify(kind)}`);
  if (typeof sizePx !== "number" || !Number.isFinite(sizePx) || sizePx <= 0) {
    throw new RangeError(`Invalid sizePx: ${JSON.stringify(sizePx)}`);
  }
  const large = sizePx >= 24 || (bold === true && sizePx >= 56 / 3);
  return { ratio: shown, large, aa: ratio >= (large ? 3 : 4.5), aaa: ratio >= (large ? 4.5 : 7) };
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function luminance(colour) {
  const match = typeof colour === "string" ? HEX.exec(colour) : null;
  if (!match) throw new TypeError(`Invalid colour: ${JSON.stringify(colour)}`);
  const hex = match[1].length === 3 ? [...match[1]].map((d) => d + d).join("") : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
