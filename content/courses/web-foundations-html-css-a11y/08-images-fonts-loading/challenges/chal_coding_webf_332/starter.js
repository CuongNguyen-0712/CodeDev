/**
 * Audit the <img> elements of a page for the problems behind a slow, jumpy, unlabelled page.
 *
 * images: the page's <img> elements in document order. Each one is:
 *   {
 *     src:           string                 the src attribute (only used to label the result)
 *     alt:           string | null          the alt attribute; null when the attribute is absent
 *     width:         number | null          the width ATTRIBUTE; null when absent
 *     height:        number | null          the height ATTRIBUTE; null when absent
 *     loading:       "lazy" | "eager" | null              null when absent (behaves like "eager")
 *     fetchpriority: "high" | "low" | "auto" | null       null when absent
 *     srcset:        { url: string, w: number }[] | null  the w-descriptor candidates;
 *                                                         null or [] means "no srcset"
 *     sizes:         string | null          the sizes attribute; null or "" means "no sizes"
 *     box:           { top, width, height } the rendered box in CSS px after layout; top is
 *                                           measured from the top of the page and is >= 0
 *     naturalWidth:  number                 the pixel width of the file that was downloaded
 *   }
 * viewport: { width, height, dpr } - the first screen in CSS px, and the device pixel ratio.
 *
 * An image is ABOVE THE FOLD when box.top < viewport.height. An image whose top is exactly
 * viewport.height starts on the second screen: it is below the fold.
 *
 * The LCP CANDIDATE is at most one image per page: among the above-the-fold images, the one with
 * the largest visible area inside the first viewport:
 *     visibleWidth  = min(box.width, viewport.width)
 *     visibleHeight = min(box.top + box.height, viewport.height) - box.top
 *     area          = visibleWidth * visibleHeight
 * An image with area 0 is never the candidate. On a tie, the earlier image in the list wins.
 * (Browsers also consider text blocks for LCP; this audit only looks at images.)
 *
 * Returns one entry per image, in input order: { src, issues }. issues lists the codes below
 * that apply, in exactly this order, each at most once ([] when the image is fine):
 *
 *   "missing-alt"           alt is null. alt="" is VALID (a decorative image) and is never reported.
 *   "generic-alt"           alt, trimmed and lower-cased, is exactly "image", "img", "photo"
 *                           or "picture".
 *   "no-dimensions"         the width or the height attribute is null (either one is enough).
 *   "lazy-above-fold"       loading is "lazy" and the image is above the fold.
 *   "lcp-not-prioritized"   the image is the LCP candidate and its fetchpriority is not "high".
 *   "srcset-without-sizes"  srcset has at least one candidate and sizes is null or "".
 *   "oversized"             the image has no srcset (null or []), box.width > 0 and
 *                           naturalWidth > 2 * box.width * viewport.dpr.
 *
 * Example: on a 390 x 844 viewport with dpr 3, a lazy hero with no width/height at top 64,
 * 390 x 293 CSS px, from a 2400 px wide file without srcset is
 *   { src, issues: ["no-dimensions", "lazy-above-fold", "lcp-not-prioritized", "oversized"] }
 * (2400 > 2 * 390 * 3 = 2340).
 *
 * images may be empty: return []. Do not modify the input.
 *
 * @param {object[]} images
 * @param {{ width: number, height: number, dpr: number }} viewport
 * @returns {{ src: string, issues: string[] }[]}
 */
function auditImages(images, viewport) {
  // TODO: find the LCP candidate first, then check every image against the rules above.
  return images.map((img) => ({ src: img.src, issues: [] }));
}
