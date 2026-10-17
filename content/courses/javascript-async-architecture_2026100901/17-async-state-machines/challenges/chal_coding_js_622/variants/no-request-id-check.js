// Wrong variant: accepts any RESOLVE/REJECT while loading, so a stale response wins.
function transition(state, event) {
  switch (event.type) {
    case "FETCH":
      return { status: "loading", requestId: state.requestId + 1, attempt: 1 };
    case "RESOLVE":
      return state.status === "loading" ? { status: "success", requestId: state.requestId, data: event.data } : state;
    case "REJECT":
      return state.status === "loading" ? { status: "error", requestId: state.requestId, attempt: state.attempt, error: event.error } : state;
    case "CANCEL":
      return state.status === "loading" ? { status: "cancelled", requestId: state.requestId } : state;
    case "RETRY":
      return state.status === "error" && state.attempt < 3 ? { status: "loading", requestId: state.requestId + 1, attempt: state.attempt + 1 } : state;
    default:
      return state;
  }
}
