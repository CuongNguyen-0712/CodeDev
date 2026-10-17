/**
 * Streams the ledger as CSV into `out` (in production: the HTTP response, or an S3
 * upload stream). `rows` is an async iterable fed by a database cursor.
 *
 * `out` behaves like a Node.js Writable:
 *   out.write(chunk)        -> true while its internal buffer is below highWaterMark,
 *                              false once the buffer is full ("please stop writing")
 *   out.once('drain', cb)   -> cb runs once the buffer has been flushed after write()
 *                              returned false
 *   out.end()               -> no more data
 *
 * BUG: exporting the full ledger (1.2 million rows) makes the pod run out of memory,
 * because the client downloads far slower than the database produces rows. Every row
 * must still be written exactly once, in order, followed by end().
 *
 * @param {AsyncIterable<{ id: number, walletId: string, amount: number, createdAt: string }>} rows
 * @param {{ write(chunk: string): boolean, once(event: 'drain', cb: () => void): void, end(): void }} out
 * @returns {Promise<void>}
 */
async function exportLedger(rows, out) {
  out.write("id,wallet_id,amount,created_at\n");

  for await (const row of rows) {
    out.write(toCsvLine(row));
  }

  out.end();
}

/**
 * @param {{ id: number, walletId: string, amount: number, createdAt: string }} row
 * @returns {string}
 */
function toCsvLine(row) {
  return `${row.id},${row.walletId},${row.amount},${row.createdAt}\n`;
}
