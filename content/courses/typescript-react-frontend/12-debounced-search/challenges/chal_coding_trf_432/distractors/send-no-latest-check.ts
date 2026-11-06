// @piece send: Send one request; show only the latest answer
abortInFlight();
const id = ++latest;
const controller = new FakeAbortController();
inFlight = controller;
search(query, controller.signal).then(
    (results) => {
        inFlight = null;
        show(results);
    },
    (error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        inFlight = null;
        showError(error instanceof Error ? error.message : String(error));
    },
);
