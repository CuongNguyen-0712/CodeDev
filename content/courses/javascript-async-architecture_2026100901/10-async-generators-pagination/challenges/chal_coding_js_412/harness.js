// Harness: Async generators & lazy pagination
// A fake cursor API: pages[0] is served for cursor null, pages[i] for pages[i - 1].nextCursor.
// Every fetchPage call is recorded, so the output shows exactly which pages were requested.
// Modes:
//   "paginate"    -> collect paginate(fetchPage)          -> { items, requests, fetchedBeforeFirstNext }
//   "take-pages"  -> collect take(paginate(fetchPage), n) -> { items, requests }
//   "take-source" -> take(n) over a counting source        -> { items, pulled, closed }
async function __harness(input) {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const pages = Array.isArray(input.pages) ? input.pages : [];
    const byCursor = new Map();
    pages.forEach((page, i) => byCursor.set(i === 0 ? null : pages[i - 1].nextCursor, page));

    const requests = [];
    const fetchPage = async (cursor) => {
        const key = cursor === undefined ? null : cursor;
        requests.push(key);
        if (requests.length > 50) throw new Error("more than 50 page requests - is the loop ending?");
        await tick();
        const page = byCursor.get(key);
        if (!page) throw new Error(`unknown cursor ${JSON.stringify(cursor)}`);
        return { items: page.items.slice(), nextCursor: page.nextCursor };
    };

    const collect = async (iterable) => {
        const out = [];
        for await (const value of iterable) {
            out.push(value);
            if (out.length > 1000) throw new Error("more than 1000 values - is the generator ending?");
        }
        return out;
    };

    if (input.mode === "paginate") {
        const iterable = paginate(fetchPage);
        await tick();
        const fetchedBeforeFirstNext = requests.length;
        const items = await collect(iterable);
        return { items, requests, fetchedBeforeFirstNext };
    }

    if (input.mode === "take-pages") {
        const items = await collect(take(paginate(fetchPage), input.n));
        await tick();
        return { items, requests };
    }

    if (input.mode === "take-source") {
        let pulled = 0;
        let closed = false;
        async function* numbers(count) {
            try {
                for (let i = 1; i <= count; i++) {
                    pulled += 1;
                    yield i;
                }
            } finally {
                closed = true;
            }
        }
        const items = await collect(take(numbers(input.count), input.n));
        await tick();
        return { items, pulled, closed };
    }

    throw new Error(`unknown mode ${input.mode}`);
}
