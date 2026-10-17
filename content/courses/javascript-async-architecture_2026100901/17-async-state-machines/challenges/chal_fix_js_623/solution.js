/**
 * Reference solution (never shipped to learners).
 * Fix: capture the requestId that FETCH created, before awaiting, and tag the
 * response with it - not with whatever request is current when it arrives.
 */
function createRequestController({ fetcher, transition }) {
  let state = { status: "idle", requestId: 0 };
  const listeners = new Set();

  function dispatch(event) {
    const next = transition(state, event);
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    cancel() {
      dispatch({ type: "CANCEL" });
    },

    async load(params) {
      dispatch({ type: "FETCH" });
      const requestId = state.requestId;
      try {
        const data = await fetcher(params);
        dispatch({ type: "RESOLVE", requestId, data });
      } catch (error) {
        dispatch({ type: "REJECT", requestId, error: error.message });
      }
    },
  };
}
