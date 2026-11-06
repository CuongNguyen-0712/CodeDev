// @piece send: Send one request; show only the latest answer
const id = ++latest;
const controller = new FakeAbortController();
inFlight = controller;
search(query, controller.signal).then(
    (results) => {
        if (id !== latest) return; // a newer request, a cleared box or an unmount
        inFlight = null;
        show(results);
    },
    (error: unknown) => {
        if (id !== latest || (error instanceof Error && error.name === "AbortError")) return;
        inFlight = null;
        showError(error instanceof Error ? error.message : String(error));
    },
);
