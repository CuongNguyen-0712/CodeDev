// Wrong variant: one malformed row throws and aborts the whole export.
function createNdjsonParser() {
  let pending = "";
  const parse = (raw, out) => {
    const line = raw.replace(/\r$/, "");
    if (line.trim() !== "") out.push(JSON.parse(line));
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
