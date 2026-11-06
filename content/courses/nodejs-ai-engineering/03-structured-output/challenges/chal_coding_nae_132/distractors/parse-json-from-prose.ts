// @piece parse-json: Parse the output, unwrapping one json fence
const trimmed = text.trim();
const fenced = /```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```/i.exec(trimmed); // first fenced block anywhere
let data: unknown;
try {
    data = JSON.parse(fenced ? fenced[1] : trimmed);
} catch {
    return { ok: false, errors: ["$: not valid JSON"] };
}
if (!isRecord(data)) return { ok: false, errors: ["$: expected an object"] };
