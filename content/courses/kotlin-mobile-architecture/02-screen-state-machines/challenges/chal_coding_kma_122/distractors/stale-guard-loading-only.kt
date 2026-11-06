// @piece stale-guard: Answers to an older request change nothing
if (state is Screen.Loading && event is Event.Answer && event.gen != state.gen) return state
