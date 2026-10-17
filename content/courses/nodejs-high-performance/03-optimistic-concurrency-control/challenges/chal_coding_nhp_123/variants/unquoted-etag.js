// Wrong variant: passes the raw header ('"3"', quotes included) as the version and
// returns an unquoted ETag - every matching save is rejected with 412.
async function updateProductPrice(req, repo) {
  const current = await repo.findById(req.params.id);
  if (!current) return { status: 404 };
  const ifMatch = req.headers["if-match"];
  if (!ifMatch) return { status: 428 };

  const updated = await repo.updateIfVersion(current.id, ifMatch, { price: req.body.price });
  if (!updated) return { status: 412 };
  return { status: 200, headers: { etag: String(updated.version) }, body: updated };
}
