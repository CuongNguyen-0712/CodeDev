/**
 * PUT /products/:id/price for the back-office, protected with ETag / If-Match.
 *
 * GET /products/:id returned the product with an ETag header holding its version in
 * double quotes, for example  ETag: "3". The editor sends it back on save:
 *   If-Match: "3"
 *
 * repo exposes:
 *   repo.findById(id)                          -> { id, version, price } or null
 *   repo.updateIfVersion(id, version, changes) -> the updated row (version + 1), or null when
 *                                                 the row's version is not `version` (0 rows:
 *                                                 UPDATE ... WHERE id = $1 AND version = $2)
 *
 * Respond with { status, headers?, body? }:
 *   404  the product does not exist
 *   428  the If-Match header is missing (Precondition Required - refuse blind overwrites)
 *   412  the If-Match version is not the current version, including when another writer
 *        commits between your read and your update (Precondition Failed)
 *   200  updated: headers.etag = the NEW version in double quotes, body = the updated row
 *
 * @param {{ params: { id: string }, headers: Record<string, string | undefined>, body: { price: number } }} req
 *        header names are lower-case, e.g. req.headers["if-match"]
 * @param {{
 *   findById(id: string): Promise<{ id: string, version: number, price: number } | null>,
 *   updateIfVersion(id: string, version: number, changes: object): Promise<{ id: string, version: number, price: number } | null>
 * }} repo
 * @returns {Promise<{ status: number, headers?: Record<string, string>, body?: any }>}
 */
async function updateProductPrice(req, repo) {
  // TODO: implement the conditional update described above
}
