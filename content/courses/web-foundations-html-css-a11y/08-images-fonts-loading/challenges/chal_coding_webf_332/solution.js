/**
 * Reference solution (never shipped to learners).
 */
function auditImages(images, viewport) {
  const lcp = findLcpCandidate(images, viewport);
  return images.map((img) => {
    const issues = [];
    const aboveFold = img.box.top < viewport.height;
    const hasSrcset = Array.isArray(img.srcset) && img.srcset.length > 0;

    if (img.alt === null) issues.push("missing-alt");
    else if (GENERIC_ALT.includes(img.alt.trim().toLowerCase())) issues.push("generic-alt");
    if (img.width === null || img.height === null) issues.push("no-dimensions");
    if (img.loading === "lazy" && aboveFold) issues.push("lazy-above-fold");
    if (img === lcp && img.fetchpriority !== "high") issues.push("lcp-not-prioritized");
    if (hasSrcset && !img.sizes) issues.push("srcset-without-sizes");
    if (!hasSrcset && img.box.width > 0 && img.naturalWidth > 2 * img.box.width * viewport.dpr) {
      issues.push("oversized");
    }
    return { src: img.src, issues };
  });
}

const GENERIC_ALT = ["image", "img", "photo", "picture"];

function findLcpCandidate(images, viewport) {
  let best = null;
  let bestArea = 0;
  for (const img of images) {
    const { top, width, height } = img.box;
    if (top >= viewport.height) continue;
    const area = Math.min(width, viewport.width) * (Math.min(top + height, viewport.height) - top);
    if (area > bestArea) {   // strictly greater: the earlier image keeps a tie
      best = img;
      bestArea = area;
    }
  }
  return best;
}
