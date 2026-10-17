// Wrong variant: blank lines are not counted, so reported line numbers do not match the file.
function createNdjsonParser() {
  let pending = "";
  let lineNumber = 0;
  const parse = (raw, out) => {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") return;
    lineNumber += 1;
    try { out.push(JSON.parse(line)); } catch { out.push({ error: "INVALID_JSON", line: lineNumber }); }
  };
  return {
    push(chunk) {
      const out = [];
      const parts = (pending + chunk).split("\n");
      pending = parts.pop();
      parts.forEach((part) => parse(part, out));
      return out;
    },
    flush() {
      const out = [];
      if (pending) parse(pending, out);
      pending = "";
      return out;
    },
  };
}
