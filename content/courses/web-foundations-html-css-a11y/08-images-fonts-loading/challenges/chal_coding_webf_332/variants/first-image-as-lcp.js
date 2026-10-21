// Wrong variant: takes the FIRST above-the-fold image as the LCP candidate. On most pages that
// is the small logo in the header, so the real hero is never asked for fetchpriority="high".
function auditImages(images, viewport) {
  const lcp = images.find((img) => img.box.top < viewport.height && img.box.width > 0 && img.box.height > 0) ?? null;
  return images.map((img) => {
    const issues = [];
    const hasSrcset = Array.isArray(img.srcset) && img.srcset.length > 0;
    if (img.alt === null) issues.push("missing-alt");
    else if (["image", "img", "photo", "picture"].includes(img.alt.trim().toLowerCase())) issues.push("generic-alt");
    if (img.width === null || img.height === null) issues.push("no-dimensions");
    if (img.loading === "lazy" && img.box.top < viewport.height) issues.push("lazy-above-fold");
    if (img === lcp && img.fetchpriority !== "high") issues.push("lcp-not-prioritized");
    if (hasSrcset && !img.sizes) issues.push("srcset-without-sizes");
    if (!hasSrcset && img.box.width > 0 && img.naturalWidth > 2 * img.box.width * viewport.dpr) issues.push("oversized");
    return { src: img.src, issues };
  });
}
