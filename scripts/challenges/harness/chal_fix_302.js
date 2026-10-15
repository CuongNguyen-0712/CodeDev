// Harness: Fix Search Race Condition with AbortController
// Each new search must abort the previous in-flight request's controller.
async function __harness(input) {
    const NativeAbortController = self.AbortController;
    const created = [];

    self.AbortController = class TrackedAbortController extends NativeAbortController {
        constructor() {
            super();
            created.push(this);
        }
    };

    try {
        const session = createSearchSession();
        const queries = (input && input.queries) || [];
        let latest = null;

        for (const query of queries) {
            const result = session.search(query);
            latest = result && result.query !== undefined ? result.query : query;
        }

        const previous = created.slice(0, -1);
        const previousAborted = previous.length > 0 && previous.every((c) => c.signal.aborted);

        return { latest, previousAborted };
    } finally {
        self.AbortController = NativeAbortController;
    }
}
