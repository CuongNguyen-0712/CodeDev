// Wrong variant: reads "18 point" as 18 CSS px, so 18px regular text counts as large
// (the real thresholds are 24px regular and about 18.67px bold).
function contrastReport(foreground, background, options) {
  const lum = (colour) => {
    if (typeof colour !== "string" || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colour)) throw new Error("bad colour");
    let hex = colour.slice(1);
    if (hex.length === 3) hex = hex.replace(/./g, "$&$&");
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(foreground), b = lum(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const { sizePx, bold, kind } = options;
  if (kind === "ui") return { ratio: Math.round(ratio * 100) / 100, large: false, aa: ratio >= 3, aaa: null };
  if (kind !== "text" || !Number.isFinite(sizePx) || sizePx <= 0) throw new Error("bad options");
  const large = sizePx >= 18 || (bold === true && sizePx >= 14);
  return { ratio: Math.round(ratio * 100) / 100, large, aa: ratio >= (large ? 3 : 4.5), aaa: ratio >= (large ? 4.5 : 7) };
}
