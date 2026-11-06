// @piece half-open-decision: After the trial calls, open again or close
transition(window.peekLast().failure() ? State.OPEN : State.CLOSED, t);
