/**
 * Pure transition function for one request lifecycle. No side effects, no mutation:
 * it returns a NEW state object for a valid transition and the SAME state object
 * (reference-equal) for an event that does not apply - so a UI can skip re-rendering.
 *
 * States (a discriminated union on `status`):
 *   { status: "idle",      requestId: 0 }
 *   { status: "loading",   requestId, attempt }
 *   { status: "success",   requestId, data }
 *   { status: "error",     requestId, attempt, error }
 *   { status: "cancelled", requestId }
 *
 * Events:
 *   { type: "FETCH" }                        any state   -> loading, requestId + 1, attempt 1
 *   { type: "RESOLVE", requestId, data }     loading     -> success   (only for the current requestId)
 *   { type: "REJECT",  requestId, error }    loading     -> error     (only for the current requestId, keeps attempt)
 *   { type: "CANCEL" }                       loading     -> cancelled (same requestId)
 *   { type: "RETRY" }                        error       -> loading, requestId + 1, attempt + 1
 *                                            (only while attempt < MAX_ATTEMPTS)
 * Anything else - a stale requestId, an event in the wrong state, an unknown type -
 * returns the current state unchanged.
 *
 * @typedef {{ status: "idle", requestId: 0 }} Idle
 * @typedef {{ status: "loading", requestId: number, attempt: number }} Loading
 * @typedef {{ status: "success", requestId: number, data: unknown }} Success
 * @typedef {{ status: "error", requestId: number, attempt: number, error: string }} Failure
 * @typedef {{ status: "cancelled", requestId: number }} Cancelled
 * @typedef {Idle | Loading | Success | Failure | Cancelled} RequestState
 *
 * @typedef {{ type: "FETCH" }
 *   | { type: "RESOLVE", requestId: number, data: unknown }
 *   | { type: "REJECT", requestId: number, error: string }
 *   | { type: "CANCEL" }
 *   | { type: "RETRY" }} RequestEvent
 *
 * @param {RequestState} state
 * @param {RequestEvent} event
 * @returns {RequestState}
 */
function transition(state, event) {
  // @piece is-current: Is this answer for the request still loading?
  const isCurrent = state.status === "loading" && event.requestId === state.requestId;
  // @end

  switch (event.type) {
    case "FETCH":
      return { status: "loading", requestId: state.requestId + 1, attempt: 1 };

    // @piece resolve: A successful answer
    case "RESOLVE":
      return isCurrent ? { status: "success", requestId: state.requestId, data: event.data } : state;
    // @end

    // @piece reject: A failed answer
    case "REJECT":
      return isCurrent
        ? { status: "error", requestId: state.requestId, attempt: state.attempt, error: event.error }
        : state;
    // @end

    // @piece cancel: The user cancels
    case "CANCEL":
      return state.status === "loading" ? { status: "cancelled", requestId: state.requestId } : state;
    // @end

    // @piece retry: The user retries
    case "RETRY":
      return state.status === "error" && state.attempt < MAX_ATTEMPTS
        ? { status: "loading", requestId: state.requestId + 1, attempt: state.attempt + 1 }
        : state;
    // @end

    default:
      return state;
  }
}

const MAX_ATTEMPTS = 3;
