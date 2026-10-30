// Wrong variant: parses every chunk on its own, as if the network delivered whole frames.
// Works when each chunk is one frame; breaks as soon as a frame is split across chunks.
async function assembleStream(chunks) {
  let text = "";
  let frames = 0;
  for await (const chunk of chunks) {
    for (const block of chunk.split(/\r?\n\r?\n/)) {
      const lines = block.split(/\r?\n/).filter((l) => l && !l.startsWith(":"));
      const isError = lines.some((l) => l.replace(/^event: ?/, "") === "error" && l.startsWith("event"));
      const data = lines.filter((l) => l.startsWith("data")).map((l) => l.replace(/^data: ?/, ""));
      if (data.length === 0) continue;
      if (isError) return { complete: false, reason: "error", text, frames };
      const payload = data.join("\n");
      if (payload === "[DONE]") return { complete: true, text, frames };
      let delta;
      try { delta = JSON.parse(payload).delta; } catch { delta = undefined; }
      if (typeof delta !== "string") return { complete: false, reason: "bad_frame", text, frames };
      text += delta;
      frames++;
    }
  }
  return { complete: false, reason: "cut", text, frames };
}
