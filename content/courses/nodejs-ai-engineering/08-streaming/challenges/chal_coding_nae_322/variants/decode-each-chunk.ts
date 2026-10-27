import { readFileSync } from "node:fs";

// The AI tutor streams its hints to the browser over SSE. The old client decoded and split every
// network chunk on its own, and it treated "the stream ended" as "the answer is complete": learners
// saw replacement characters inside Vietnamese text, and half a sentence was saved as a finished hint.
// Write assembleStream(chunks): the bytes of one recorded stream, cut into chunks at arbitrary
// places. The full rules are in the challenge description. Do not change the types or the test runner.

type StreamResult = {
    status: "complete" | "truncated" | "error";
    text: string; // every delta received, in order (also when the stream did not complete)
    error: string | null; // the error message when status is "error", otherwise null
};

function assembleStream(chunks: Uint8Array[]): StreamResult {
    let buffer = ""; // text received but not yet ended by "\n"
    let eventType = "";
    let data: string[] = [];
    let text = "";

    // Returns a final result when the event ends the stream, otherwise null.
    const dispatch = (): StreamResult | null => {
        const type = eventType || "message";
        const payload = data.join("\n");
        const hasData = data.length > 0;
        eventType = "";
        data = [];
        if (!hasData) return null;
        if (type === "error") return { status: "error", text, error: payload };
        if (type !== "message") return null; // ping, usage and other events are not part of the answer
        if (payload === "[DONE]") return { status: "complete", text, error: null };
        let parsed: unknown;
        try {
            parsed = JSON.parse(payload);
        } catch {
            return { status: "error", text, error: "malformed event" };
        }
        if (typeof parsed !== "object" || parsed === null || !("delta" in parsed) || typeof parsed.delta !== "string") {
            return { status: "error", text, error: "malformed event" };
        }
        text += parsed.delta;
        return null;
    };

    for (const chunk of chunks) {
        buffer += new TextDecoder("utf-8").decode(chunk);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line === "") {
                const result = dispatch();
                if (result) return result;
                continue;
            }
            if (line.startsWith(":")) continue; // comment, e.g. a keep-alive
            const colon = line.indexOf(":");
            const field = colon === -1 ? line : line.slice(0, colon);
            let value = colon === -1 ? "" : line.slice(colon + 1);
            if (value.startsWith(" ")) value = value.slice(1);
            if (field === "event") eventType = value;
            else if (field === "data") data.push(value);
            // id, retry and unknown fields are ignored
        }
    }
    // The stream ended without a done marker: whatever is left in the buffer is an event that never got its blank line.
    return { status: "truncated", text, error: null };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of recordings { stream, cuts }: the stream text and the byte offsets where the network cut it.
// Output: the StreamResult of each recording, as JSON.
type Recording = { stream: string; cuts: number[] };
const recordings: Recording[] = JSON.parse(readFileSync(0, "utf8"));
const results = recordings.map(({ stream, cuts }) => {
    const bytes = new TextEncoder().encode(stream);
    const bounds = [0, ...cuts, bytes.length];
    const chunks: Uint8Array[] = [];
    for (let i = 0; i + 1 < bounds.length; i++) chunks.push(bytes.slice(bounds[i], bounds[i + 1]));
    return assembleStream(chunks);
});
console.log(JSON.stringify(results));
