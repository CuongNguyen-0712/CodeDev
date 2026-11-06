// @piece on-input: Wait for a pause in typing
const query = text.trim();
if (query === "") {
    latest++;
    abortInFlight();
    show([]);
    return;
}
if (timer !== null) return;
timer = clock.setTimeout(() => {
    timer = null;
    send(query);
}, debounceMs);
