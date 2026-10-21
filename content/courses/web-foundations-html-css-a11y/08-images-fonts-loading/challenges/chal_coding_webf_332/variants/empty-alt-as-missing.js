// Wrong variant: checks alt with !img.alt, so a decorative image with alt="" is reported as
// "missing-alt" - the audit would push the team to add noise like alt="divider".
function auditImages(images, viewport) {
  let lcp = null;
  let bestArea = 0;
  for (const img of images) {
    const { top, width, height } = img.box;
    if (top >= viewport.height) continue;
    const area = Math.min(width, viewport.width) * (Math.min(top + height, viewport.height) - top);
    if (area > bestArea) { lcp = img; bestArea = area; }
  }
  return images.map((img) => {
    const issues = [];
    const hasSrcset = Array.isArray(img.srcset) && img.srcset.length > 0;
    if (!img.alt) issues.push("missing-alt");
    else if (["image", "img", "photo", "picture"].includes(img.alt.trim().toLowerCase())) issues.push("generic-alt");
    if (img.width === null || img.height === null) issues.push("no-dimensions");
    if (img.loading === "lazy" && img.box.top < viewport.height) issues.push("lazy-above-fold");
    if (img === lcp && img.fetchpriority !== "high") issues.push("lcp-not-prioritized");
    if (hasSrcset && !img.sizes) issues.push("srcset-without-sizes");
    if (!hasSrcset && img.box.width > 0 && img.naturalWidth > 2 * img.box.width * viewport.dpr) issues.push("oversized");
    return { src: img.src, issues };
  });
}
