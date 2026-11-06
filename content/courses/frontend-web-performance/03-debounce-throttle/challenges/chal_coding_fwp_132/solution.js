// search/searchBox.js: the dish search on the menu page. The first version sent a request per
// keystroke and sometimes showed the results of an older, slower query over the newer ones.
// This is the fixed version: it waits for a pause, cancels the request it no longer needs, and
// never lets an old answer overwrite a newer one.
//
// env:    { setTimeout(fn, ms) -> id, clearTimeout(id), fetch(query, { signal }) -> Promise<results>,
//           show(results) }   (fetch rejects with an error named "AbortError" when its signal aborts,
//           if the search client supports cancelling at all)
// return: onInput(text), called on every input event of the search box
function createSearchBox(env, waitMs) {
    let timer = null;
    let controller = null;
    let latest = 0;

    async function search(query) {
        // @piece abort-previous: Cancel the request that is still running
        if (controller) controller.abort();
        controller = new AbortController();
        // @end
        const id = ++latest;
        try {
            const results = await env.fetch(query, { signal: controller.signal });
            // @piece latest-only: Show results only for the newest query
            if (id === latest) env.show(results);
            // @end
        } catch (error) {
            if (error.name !== "AbortError") throw error;
        }
    }

    return function onInput(text) {
        // @piece wait-for-pause: Search once typing has paused for waitMs
        env.clearTimeout(timer);
        timer = env.setTimeout(() => search(text.trim()), waitMs);
        // @end
    };
}
