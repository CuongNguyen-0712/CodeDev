// Wrong variant: treats box.top <= viewport.height as above the fold, so an image that starts
// exactly on the second screen is reported as "lazy-above-fold".
function auditImages(images, viewport) {
  const aboveFold = (img) => img.box.top <= viewport.height;
  let lcp = null;
  let bestArea = 0;
  for (const img of images) {
    if (!aboveFold(img)) continue;
    const { top, width, height } = img.box;
    const area = Math.min(width, viewport.width) * (Math.min(top + height, viewport.height) - top);
    if (area > bestArea) { lcp = img; bestArea = area; }
  }
  return images.map((img) => {
    const issues = [];
    const hasSrcset = Array.isArray(img.srcset) && img.srcset.length > 0;
    if (img.alt === null) issues.push("missing-alt");
    else if (["image", "img", "photo", "picture"].includes(img.alt.trim().toLowerCase())) issues.push("generic-alt");
    if (img.width === null || img.height === null) issues.push("no-dimensions");
    if (img.loading === "lazy" && aboveFold(img)) issues.push("lazy-above-fold");
    if (img === lcp && img.fetchpriority !== "high") issues.push("lcp-not-prioritized");
    if (hasSrcset && !img.sizes) issues.push("srcset-without-sizes");
    if (!hasSrcset && img.box.width > 0 && img.naturalWidth > 2 * img.box.width * viewport.dpr) issues.push("oversized");
    return { src: img.src, issues };
  });
}
