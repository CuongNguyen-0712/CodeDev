// Harness: Fix the UTF-8 decoding of a streamed body
// Encodes input.text as UTF-8, optionally drops the last bytes (a truncated download),
// cuts the bytes into chunks (at the byte offsets in splitAt, or every chunkSize bytes)
// and serves them from a pull-based ReadableStream.
// Output: { text, chunks, locked } - the decoded text, how many chunks were sent and
// whether the stream is still locked after readAllText() returned.
async function __harness(input) {
    const all = new TextEncoder().encode(String(input.text || ""));
    const bytes = all.slice(0, all.length - (Number(input.dropLastBytes) || 0));

    const cuts = [];
    if (input.chunkSize > 0) {
        for (let at = input.chunkSize; at < bytes.length; at += input.chunkSize) cuts.push(at);
    } else if (Array.isArray(input.splitAt)) {
        cuts.push(...input.splitAt);
    }

    const chunks = [];
    let start = 0;
    for (const cut of cuts) {
        if (cut > start && cut < bytes.length) {
            chunks.push(bytes.slice(start, cut));
            start = cut;
        }
    }
    if (start < bytes.length) chunks.push(bytes.slice(start));

    let index = 0;
    const body = new ReadableStream({
        pull(controller) {
            if (index < chunks.length) controller.enqueue(chunks[index++]);
            else controller.close();
        },
    });

    const text = await readAllText(body);
    return { text, chunks: chunks.length, locked: body.locked };
}
