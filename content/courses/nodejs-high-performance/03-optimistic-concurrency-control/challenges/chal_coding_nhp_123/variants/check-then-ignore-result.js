// Wrong variant: compares If-Match with a fresh read, then assumes the update worked.
// A writer that commits between the read and the UPDATE is reported as a success.
async function updateProductPrice(req, repo) {
  const current = await repo.findById(req.params.id);
  if (!current) return { status: 404 };
  const ifMatch = req.headers["if-match"];
  if (!ifMatch) return { status: 428 };
  if (ifMatch !== `"${current.version}"`) return { status: 412 };

  await repo.updateIfVersion(current.id, current.version, { price: req.body.price });
  const version = current.version + 1;
  return { status: 200, headers: { etag: `"${version}"` }, body: { ...current, price: req.body.price, version } };
}
