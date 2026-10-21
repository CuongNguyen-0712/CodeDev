/**
 * Make a snapshot deterministic: normalize a value before it is snapshotted.
 *
 * normalizeForSnapshot(value) receives plain JSON data (objects, arrays, strings, numbers,
 * booleans, null) - for example an invoice from buildInvoice(). It returns a NEW deep copy in which:
 *
 *   1. Object keys are sorted with the default Array.prototype.sort() (Object.keys(obj).sort()),
 *      at EVERY depth - inside nested objects and inside objects in arrays too.
 *   2. A string that matches TIMESTAMP (the whole string) becomes "<timestamp>".
 *   3. A string that matches UUID (the whole string) becomes "<id-1>", "<id-2>", ... numbered by
 *      first appearance. The SAME uuid string always gets the SAME placeholder, so relationships
 *      survive (a discount whose appliesTo points at a line keeps pointing at that line's id).
 *      "First appearance" means a depth-first walk that visits object keys in sorted order and
 *      array items in index order, starting from 1 on every call.
 *   4. Everything else is copied unchanged: numbers, booleans, null, other strings (including a
 *      date without a time such as "2026-11-20"), and the order of array items.
 *
 * The input must not be changed in any way, and the result must not share any object or array
 * with the input.
 *
 * Example:
 *   normalizeForSnapshot({
 *     total: 2750,
 *     id: "5f0c7a52-1b7e-4d0a-9a3c-2b1e8f6d4c11",
 *     createdAt: "2026-10-21T09:19:24.446Z",
 *     lines: [{ sku: "MUG-01", invoiceId: "5f0c7a52-1b7e-4d0a-9a3c-2b1e8f6d4c11" }],
 *   })
 *   // -> { createdAt: "<timestamp>", id: "<id-1>",
 *   //      lines: [{ invoiceId: "<id-1>", sku: "MUG-01" }], total: 2750 }
 *
 * @param {unknown} value  plain JSON data
 * @returns {unknown}      a normalized deep copy
 */
function normalizeForSnapshot(value) {
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // TODO: a deep copy alone keeps the volatile fields and the original key order.
  return JSON.parse(JSON.stringify(value));
}
