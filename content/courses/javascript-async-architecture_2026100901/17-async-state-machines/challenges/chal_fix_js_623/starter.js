/**
 * A hook-like controller that connects the request state machine to the network.
 * The UI calls load(params) on every input change and re-renders on every
 * notification from subscribe().
 *
 * The state machine (`transition`, injected) is correct: it ignores RESOLVE/REJECT
 * events whose requestId is not the current one. Yet on slow mobile networks users
 * see results - or an error banner - for the query they typed BEFORE the current one.
 *
 * BUG: find it in this controller, not in the machine. Hint: which requestId does a
 * response get tagged with, and when is that value read?
 *
 * @typedef {{ status: string, requestId: number, [key: string]: unknown }} RequestState
 * @typedef {(state: RequestState, event: { type: string, [key: string]: unknown }) => RequestState} Transition
 *
 * @param {{ fetcher: (params: unknown) => Promise<unknown>, transition: Transition }} deps
 * @returns {{
 *   getState(): RequestState,
 *   subscribe(listener: (state: RequestState) => void): () => void,
 *   load(params: unknown): Promise<void>,
 *   cancel(): void
 * }}
 */
function createRequestController({ fetcher, transition }) {
  /** @type {RequestState} */
  let state = { status: "idle", requestId: 0 };
  const listeners = new Set();

  function dispatch(event) {
    const next = transition(state, event);
    if (next === state) return; // ignored event: nothing to render
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
      try {
        const data = await fetcher(params);
        dispatch({ type: "RESOLVE", requestId: state.requestId, data });
      } catch (error) {
        dispatch({ type: "REJECT", requestId: state.requestId, error: error.message });
      }
    },
  };
}
