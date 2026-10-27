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
    // 1. decode the bytes as UTF-8 with one decoder for the whole stream (a character can be split between chunks)
    // 2. keep the text that has no "\n" yet for the next chunk; handle each complete line
    // 3. a blank line ends an event: an "error" event, a "message" with [DONE], or a JSON delta
    // 4. no done marker before the end of the bytes: the answer is truncated
    return { status: "complete", text: "", error: null };
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
