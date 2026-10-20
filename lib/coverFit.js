/**
 * How an image sits in a 16:9 cover frame: real covers (close to 16:9) fill it, anything else
 * (a square logo, a portrait image, the fallback icon) is shown whole instead of being cropped.
 * Set as `data-fit` on the <img>; style with `data-[fit=contain]:object-contain`.
 */
export function coverFit(width, height) {
    if (!width || !height) return null;
    return Math.abs(width / height - 16 / 9) < 0.25 ? "cover" : "contain";
}

/** Use as both `ref` and `onLoad` handler target: cached images are complete before onLoad. */
export function fitCover(img) {
    if (!img?.complete) return;
    const fit = coverFit(img.naturalWidth, img.naturalHeight);
    if (fit) img.dataset.fit = fit;
}
