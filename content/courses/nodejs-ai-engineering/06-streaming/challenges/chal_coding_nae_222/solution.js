/**
 * Reference solution (never shipped to learners).
 */
async function assembleStream(chunks) {
  let buffer = "";
  let text = "";
  let frames = 0;
  let data = null; // data values of the event being read, null = no data line yet
  let event = "";

  for await (const chunk of chunks) {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      if (line === "") {
        if (data !== null) {
          const payload = data.join("\n");
          if (event === "error") return { complete: false, reason: "error", text, frames };
          if (payload === "[DONE]") return { complete: true, text, frames };
          let delta;
          try {
            delta = JSON.parse(payload).delta;
          } catch {
            delta = undefined;
          }
          if (typeof delta !== "string") return { complete: false, reason: "bad_frame", text, frames };
          text += delta;
          frames++;
        }
        data = null;
        event = "";
        continue;
      }
      if (line.startsWith(":")) continue;

      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") (data ??= []).push(value);
      else if (field === "event") event = value;
    }
  }
  return { complete: false, reason: "cut", text, frames };
}
