// Wrong variant: correct result, but nothing is emitted until the stream ends - not streaming at all.
function createNdjsonParser() {
  let all = "";
  return {
    push(chunk) {
      all += chunk;
      return [];
    },
    flush() {
      const out = [];
      all.split("\n").forEach((raw, i) => {
        const line = raw.replace(/\r$/, "");
        if (line.trim() === "") return;
        try { out.push(JSON.parse(line)); } catch { out.push({ error: "INVALID_JSON", line: i + 1 }); }
      });
      return out;
    },
  };
}
