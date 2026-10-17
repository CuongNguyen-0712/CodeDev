/**
 * Reference solution (never shipped to learners).
 */
function transition(state, event) {
  const isCurrent = state.status === "loading" && event.requestId === state.requestId;

  switch (event.type) {
    case "FETCH":
      return { status: "loading", requestId: state.requestId + 1, attempt: 1 };

    case "RESOLVE":
      return isCurrent ? { status: "success", requestId: state.requestId, data: event.data } : state;

    case "REJECT":
      return isCurrent
        ? { status: "error", requestId: state.requestId, attempt: state.attempt, error: event.error }
        : state;

    case "CANCEL":
      return state.status === "loading" ? { status: "cancelled", requestId: state.requestId } : state;

    case "RETRY":
      return state.status === "error" && state.attempt < MAX_ATTEMPTS
        ? { status: "loading", requestId: state.requestId + 1, attempt: state.attempt + 1 }
        : state;

    default:
      return state;
  }
}

const MAX_ATTEMPTS = 3;
