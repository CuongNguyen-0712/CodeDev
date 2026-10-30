// Wrong variant: joins everything and splits on blank lines, but also applies the last block,
// which never received its empty line - a "[DONE]" that was cut before "\n\n" counts as complete.
async function assembleStream(chunks) {
  let all = "";
  for await (const chunk of chunks) all += chunk;
  let text = "";
  let frames = 0;
  for (const block of all.split(/\r?\n\r?\n/)) {
    let event = "";
    const data = [];
    for (const raw of block.split(/\r?\n/)) {
      if (raw === "" || raw.startsWith(":")) continue;
      const colon = raw.indexOf(":");
      const field = colon === -1 ? raw : raw.slice(0, colon);
      let value = colon === -1 ? "" : raw.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
    }
    if (data.length === 0) continue;
    if (event === "error") return { complete: false, reason: "error", text, frames };
    const payload = data.join("\n");
    if (payload === "[DONE]") return { complete: true, text, frames };
    let delta;
    try { delta = JSON.parse(payload).delta; } catch { delta = undefined; }
    if (typeof delta !== "string") return { complete: false, reason: "bad_frame", text, frames };
    text += delta;
    frames++;
  }
  return { complete: false, reason: "cut", text, frames };
}
