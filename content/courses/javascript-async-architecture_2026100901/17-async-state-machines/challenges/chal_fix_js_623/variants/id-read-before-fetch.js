// Wrong variant: reads the requestId BEFORE dispatching FETCH - every response is
// tagged with the previous request's id, so even the current one is ignored.
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
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    cancel() { dispatch({ type: "CANCEL" }); },
    async load(params) {
      const requestId = state.requestId;
      dispatch({ type: "FETCH" });
      try {
        const data = await fetcher(params);
        dispatch({ type: "RESOLVE", requestId, data });
      } catch (error) {
        dispatch({ type: "REJECT", requestId, error: error.message });
      }
    },
  };
}
