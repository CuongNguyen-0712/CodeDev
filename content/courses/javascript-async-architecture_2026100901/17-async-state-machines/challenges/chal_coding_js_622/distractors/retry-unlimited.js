// @piece retry: The user retries
case "RETRY":
  return state.status === "error"
    ? { status: "loading", requestId: state.requestId + 1, attempt: state.attempt + 1 }
    : state;
