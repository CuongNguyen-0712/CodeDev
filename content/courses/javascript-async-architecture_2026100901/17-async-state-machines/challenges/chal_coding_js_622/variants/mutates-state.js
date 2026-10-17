// Wrong variant: "updates" the state object in place - React and friends never see a change.
function transition(state, event) {
  const isCurrent = state.status === "loading" && event.requestId === state.requestId;
  if (event.type === "FETCH") {
    for (const key of Object.keys(state)) delete state[key];
    return Object.assign(state, { status: "loading", requestId: (state.requestId || 0) + 1, attempt: 1 });
  }
  if (event.type === "RESOLVE" && isCurrent) {
    delete state.attempt;
    return Object.assign(state, { status: "success", data: event.data });
  }
  if (event.type === "REJECT" && isCurrent) return Object.assign(state, { status: "error", error: event.error });
  if (event.type === "CANCEL" && state.status === "loading") {
    delete state.attempt;
    return Object.assign(state, { status: "cancelled" });
  }
  if (event.type === "RETRY" && state.status === "error" && state.attempt < 3) {
    delete state.error;
    return Object.assign(state, { status: "loading", requestId: state.requestId + 1, attempt: state.attempt + 1 });
  }
  return state;
}
