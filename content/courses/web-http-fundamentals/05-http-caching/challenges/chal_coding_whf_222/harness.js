// Harness: parses each Cache-Control value in input.headers with the learner's parseCacheControl.
// Output, one entry per header: exactly { maxAge, noStore, noCache, private, public }
// (extra keys returned by the learner are ignored).
async function __harness(input) {
    return input.headers.map((header) => {
        const r = parseCacheControl(header) || {};
        return {
            maxAge: r.maxAge === undefined ? null : r.maxAge,
            noStore: r.noStore,
            noCache: r.noCache,
            private: r.private,
            public: r.public,
        };
    });
}
