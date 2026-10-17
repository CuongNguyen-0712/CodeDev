/**
 * Reference solution (never shipped to learners).
 */
function createNdjsonParser() {
  let pending = "";
  let lineNumber = 0;

  function parseLine(raw, out) {
    lineNumber += 1;
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.trim() === "") return;
    try {
      out.push(JSON.parse(line));
    } catch {
      out.push({ error: "INVALID_JSON", line: lineNumber });
    }
  }

  return {
    push(chunk) {
      const out = [];
      const parts = (pending + chunk).split("\n");
      pending = parts.pop();
      for (const part of parts) parseLine(part, out);
      return out;
    },
    flush() {
      const out = [];
      if (pending !== "") parseLine(pending, out);
      pending = "";
      return out;
    },
  };
}
