/**
 * How an image sits in a 16:9 cover frame: real covers (close to 16:9) fill it, anything else
 * (a square logo, a portrait image, the fallback icon) is shown whole instead of being cropped.
 * Set as `data-fit` on the <img>; style with `data-[fit=contain]:object-contain`.
 */
export function coverFit(width, height) {
    if (!width || !height) return null;
    return Math.abs(width / height - 16 / 9) < 0.25 ? "cover" : "contain";
}

// Catalog covers are Cloudinary URLs stored with `c_limit,w_1600` (db/seeds); swapping the width
// gives smaller renditions of the same asset.
const CLOUDINARY_WIDTH = /\/image\/upload\/c_limit,w_\d+\//;
const COVER_WIDTHS = [320, 480, 640, 960, 1600];

/** `srcSet` for a cover URL, or undefined for any other URL (fallback icons, other hosts). */
export function coverSrcSet(url) {
    if (typeof url !== "string" || !CLOUDINARY_WIDTH.test(url)) return undefined;
    return COVER_WIDTHS
        .map((w) => `${url.replace(CLOUDINARY_WIDTH, `/image/upload/c_limit,w_${w}/`)} ${w}w`)
        .join(", ");
}

/** Use as both `ref` and `onLoad` handler target: cached images are complete before onLoad. */
export function fitCover(img) {
    if (!img?.complete) return;
    const fit = coverFit(img.naturalWidth, img.naturalHeight);
    if (fit) img.dataset.fit = fit;
}
