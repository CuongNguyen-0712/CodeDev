// Harness: Incremental NDJSON parser
// Feeds the chunks to push() one by one, then calls flush() once.
// Chunks come from input.chunks, or input.text cut every input.chunkSize characters.
// Output: { entries, emittedBy } - every entry in order, and for each entry the index
// of the push() call that returned it ("flush" when it came from flush()).
async function __harness(input) {
    let chunks = [];
    if (Array.isArray(input.chunks)) {
        chunks = input.chunks;
    } else {
        const text = String(input.text || "");
        const size = Math.max(1, Number(input.chunkSize) || 1);
        for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    }

    const parser = createNdjsonParser();
    const entries = [];
    const emittedBy = [];

    const collect = (result, source, label) => {
        if (!Array.isArray(result)) throw new Error(`${label} must return an array, got ${JSON.stringify(result)}`);
        for (const entry of result) {
            entries.push(entry);
            emittedBy.push(source);
        }
    };

    chunks.forEach((chunk, index) => collect(parser.push(chunk), index, `push(chunk ${index})`));
    collect(parser.flush(), "flush", "flush()");

    return { entries, emittedBy };
}
