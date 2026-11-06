// @piece resolve: A successful answer
case "RESOLVE":
  return state.status === "loading" ? { status: "success", requestId: state.requestId, data: event.data } : state;
