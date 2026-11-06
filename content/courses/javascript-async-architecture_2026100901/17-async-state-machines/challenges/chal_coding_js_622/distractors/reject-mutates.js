// @piece reject: A failed answer
case "REJECT":
  if (isCurrent) {
    state.status = "error";
    state.error = event.error;
  }
  return state;
