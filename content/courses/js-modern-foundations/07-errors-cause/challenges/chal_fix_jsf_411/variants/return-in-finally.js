// Wrong variant: errors are built correctly, but `return` inside finally replaces the thrown
// ImportError with a normal return value - the job reports "0 rows imported" again.
class ImportError extends Error {
  constructor(message, code, options) {
    super(message, options);            // options.cause is kept on the error
    this.name = "ImportError";
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

function importOrders(csvText, store) {
  const lines = csvText.trim().split("\n");
  let imported = 0;
  try {
    const rows = [];
    const invalid = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        rows.push(parseRow(lines[i], i + 1));
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;   // not ours to handle
        invalid.push(error);
      }
    }
    if (invalid.length > 0) {
      throw new ImportError(
        `Import failed: ${invalid.length} of ${lines.length - 1} rows invalid`,
        "IMPORT_INVALID_ROWS",
        { cause: new AggregateError(invalid, "Invalid rows") },
      );
    }
    try {
      store.save(rows);
    } catch (error) {
      throw new ImportError(`Import failed: could not save ${rows.length} rows`, "IMPORT_SAVE_FAILED", { cause: error });
    }
    imported = rows.length;
  } finally {
    store.close();
    return imported;
  }
}

function parseRow(line, lineNumber) {
  const fields = line.split(",");
  if (fields.length !== 3) throw new ValidationError(`Line ${lineNumber}: expected 3 fields, got ${fields.length}`, lineNumber);
  const [id, date, amount] = fields;
  if (!isRealDate(date)) throw new ValidationError(`Line ${lineNumber}: invalid date "${date}"`, lineNumber);
  if (amount.trim() === "" || !Number.isFinite(Number(amount))) {
    throw new ValidationError(`Line ${lineNumber}: invalid amount "${amount}"`, lineNumber);
  }
  return { id, date, amount: Number(amount) };
}

function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
