/**
 * Incremental NDJSON (newline-delimited JSON) parser for a streamed export.
 * The text arrives in chunks of arbitrary size - a chunk can end anywhere,
 * including in the middle of a row.
 *
 * Requirements:
 *   - push(chunk) returns the entries for every line COMPLETED by this chunk
 *     (a line ends with "\n"); an unfinished line is kept for the next push()
 *   - flush() is called once at the end of the stream and returns the entry for
 *     a last line that has no trailing "\n"
 *   - "\r\n" line endings are accepted (drop the trailing "\r")
 *   - empty or whitespace-only lines are skipped, but they still count as lines
 *   - a line that is not valid JSON does not stop the parser: it produces
 *     { error: "INVALID_JSON", line: <1-based line number> }
 *
 * @returns {{ push(chunk: string): Array<any>, flush(): Array<any> }}
 */
function createNdjsonParser() {
  // TODO: keep the unfinished tail between push() calls and parse complete lines

  return {
    push(chunk) {
      return [];
    },
    flush() {
      return [];
    },
  };
}
