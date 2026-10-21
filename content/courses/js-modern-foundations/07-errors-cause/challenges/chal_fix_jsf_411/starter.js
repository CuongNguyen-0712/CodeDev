/**
 * Nightly order import: parses a CSV export and saves every row in one call.
 *
 * Requirements:
 *   - Line 1 of csvText is the header "id,date,amount". Data starts on line 2; line numbers in
 *     messages are file line numbers (the header is line 1).
 *   - A data row is valid when it has exactly 3 fields, the date is a real calendar date in
 *     YYYY-MM-DD form and the amount is a number. parseRow already knows the messages:
 *       Line 7: expected 3 fields, got 4
 *       Line 7: invalid date "2026-02-30"
 *       Line 7: invalid amount "abc"
 *     Each invalid row must be reported as a ValidationError (code "INVALID_ROW", line = line number).
 *   - Check EVERY row before saving. If at least one row is invalid, nothing is saved and
 *     importOrders throws an ImportError with
 *       name "ImportError", code "IMPORT_INVALID_ROWS",
 *       message "Import failed: <invalid> of <total> rows invalid",
 *       cause: an AggregateError with message "Invalid rows" whose errors are all the
 *              ValidationErrors, in file order.
 *   - If store.save(rows) throws, importOrders throws an ImportError with
 *       code "IMPORT_SAVE_FAILED", message "Import failed: could not save <n> rows",
 *       cause: the original error from the store, unchanged.
 *   - On success it returns the number of saved rows.
 *   - store.close() runs exactly once, whatever happens.
 *   - Never throw strings, never swallow an error, never lose the original error.
 *
 * BUG: on-call only ever sees "Error: Import failed" - no line, no reason, no cause. And when the
 * database is down, the job happily reports "0 rows imported". Fix it.
 */
class ImportError extends Error {
  constructor(message, code, options) {
    super(message);
    this.code = code;
  }
}

class ValidationError extends Error {
  constructor(message, line) {
    super(message);
    this.name = "ValidationError";
    this.code = "INVALID_ROW";
    this.line = line;
  }
}

/**
 * @param {string} csvText
 * @param {{ save(rows: { id: string, date: string, amount: number }[]): void, close(): void }} store
 * @returns {number} number of saved rows
 */
function importOrders(csvText, store) {
  const lines = csvText.trim().split("\n");
  try {
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      rows.push(parseRow(lines[i], i + 1));
    }
    return saveRows(store, rows);
  } catch (error) {
    throw new Error("Import failed");
  } finally {
    store.close();
  }
}

function parseRow(line, lineNumber) {
  const fields = line.split(",");
  if (fields.length !== 3) throw `Line ${lineNumber}: expected 3 fields, got ${fields.length}`;
  const [id, date, amount] = fields;
  if (!isRealDate(date)) throw `Line ${lineNumber}: invalid date "${date}"`;
  if (amount.trim() === "" || !Number.isFinite(Number(amount))) {
    throw `Line ${lineNumber}: invalid amount "${amount}"`;
  }
  return { id, date, amount: Number(amount) };
}

function saveRows(store, rows) {
  try {
    store.save(rows);
    return rows.length;
  } catch (error) {
    return 0;
  }
}

function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
