// Wrong variant: parses every chunk on its own, so a row split across two chunks is lost.
function createNdjsonParser() {
  let lineNumber = 0;
  const parse = (lines, out) => {
    for (const raw of lines) {
      lineNumber += 1;
      const line = raw.replace(/\r$/, "");
      if (line.trim() === "") continue;
      try { out.push(JSON.parse(line)); } catch { out.push({ error: "INVALID_JSON", line: lineNumber }); }
    }
    return out;
  };
  return {
    push(chunk) {
      const lines = chunk.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      return parse(lines, []);
    },
    flush() {
      return [];
    },
  };
}
