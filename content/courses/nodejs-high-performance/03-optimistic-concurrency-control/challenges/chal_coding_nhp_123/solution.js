/**
 * Reference solution (never shipped to learners).
 * The version the CLIENT saw (If-Match) goes into the conditional UPDATE - never the
 * version we just read ourselves. A null result is a lost race (412) unless the
 * product is gone (404).
 */
async function updateProductPrice(req, repo) {
  const id = req.params.id;
  const ifMatch = req.headers["if-match"];

  const current = await repo.findById(id);
  if (!current) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!ifMatch) return { status: 428, body: { error: "PRECONDITION_REQUIRED" } };

  const match = /^"(\d+)"$/.exec(String(ifMatch).trim());
  const expectedVersion = match ? Number(match[1]) : NaN;
  if (expectedVersion !== current.version) {
    return { status: 412, body: { error: "PRECONDITION_FAILED" } };
  }

  const updated = await repo.updateIfVersion(id, expectedVersion, { price: req.body.price });
  if (!updated) {
    const stillThere = await repo.findById(id);
    return stillThere
      ? { status: 412, body: { error: "PRECONDITION_FAILED" } }
      : { status: 404, body: { error: "NOT_FOUND" } };
  }

  return { status: 200, headers: { etag: `"${updated.version}"` }, body: updated };
}
