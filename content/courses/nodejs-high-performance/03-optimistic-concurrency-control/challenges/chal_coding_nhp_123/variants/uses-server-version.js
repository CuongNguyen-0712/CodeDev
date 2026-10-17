// Wrong variant: requires If-Match but updates with the version it just read itself,
// so a stale editor silently overwrites newer data (the lost update is back).
async function updateProductPrice(req, repo) {
  const current = await repo.findById(req.params.id);
  if (!current) return { status: 404 };
  if (!req.headers["if-match"]) return { status: 428 };

  const updated = await repo.updateIfVersion(current.id, current.version, { price: req.body.price });
  if (!updated) return { status: 412 };
  return { status: 200, headers: { etag: `"${updated.version}"` }, body: updated };
}
