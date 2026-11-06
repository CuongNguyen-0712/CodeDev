// @piece closed-decision: Open once enough calls show too many failures
if (tooBad()) {
    transition(State.OPEN, t);
}
