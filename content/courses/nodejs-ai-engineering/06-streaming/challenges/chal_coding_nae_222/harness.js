// Harness: replays recorded network chunks into the learner's assembleStream.
// No network: each stream is an async generator that yields the recorded strings one by one,
// with a microtask between them, like a response body read with a reader.
// input.streams    a list of streams, each a list of raw chunk strings
// input.generate   { frames, chunkSize }: one large stream of `frames` delta frames + [DONE],
//                  cut into chunks of chunkSize characters; the text is summarised in the output
// Output: one result per stream (the value assembleStream returned, or "threw <name>: <message>").
async function __harness(input) {
    async function* replay(chunks) {
        for (const chunk of chunks) {
            await Promise.resolve();
            yield chunk;
        }
    }

    let streams = input.streams || [];
    if (input.generate) {
        let raw = "";
        for (let i = 0; i < input.generate.frames; i++) raw += "data: " + JSON.stringify({ delta: "w" + i + " " }) + "\n\n";
        raw += "data: [DONE]\n\n";
        const chunks = [];
        for (let i = 0; i < raw.length; i += input.generate.chunkSize) chunks.push(raw.slice(i, i + input.generate.chunkSize));
        streams = [chunks];
    }

    const results = [];
    for (const chunks of streams) {
        let result;
        try {
            result = await assembleStream(replay(chunks));
        } catch (error) {
            result = "threw " + (error && error.name) + ": " + (error && error.message);
        }
        if (input.generate && result && typeof result.text === "string") {
            result = { ...result, text: { length: result.text.length, start: result.text.slice(0, 12), end: result.text.slice(-12) } };
        }
        results.push(result);
    }
    return results;
}
