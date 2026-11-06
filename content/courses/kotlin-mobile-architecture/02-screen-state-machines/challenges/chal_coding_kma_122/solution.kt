// Rice Rocket courier app: the Order history screen as a state machine.
// Every request gets a new number (`gen`); answers carry the number of the request they answer.

sealed interface Screen {
    val gen: Int
    data class Loading(override val gen: Int) : Screen
    data class Content(val items: List<String>, val refreshing: Boolean, val notice: String?, override val gen: Int) : Screen
    data class Empty(override val gen: Int) : Screen
    data class Error(val message: String, override val gen: Int) : Screen
}

sealed interface Event {
    data class Start(val gen: Int) : Event
    data class Refresh(val gen: Int) : Event
    data class Retry(val gen: Int) : Event
    sealed interface Answer : Event { val gen: Int }
    data class Success(override val gen: Int, val items: List<String>) : Answer
    data class Failure(override val gen: Int, val message: String) : Answer
}

fun next(state: Screen, event: Event): Screen {
    // @piece stale-guard: Answers to an older request change nothing
    if (event is Event.Answer && event.gen != state.gen) return state
    // @end
    return when (event) {
        // @piece start: Opening the screen starts a fresh request
        is Event.Start -> Screen.Loading(event.gen)
        // @end
        // @piece refresh: Refresh keeps content on screen, reloads an empty one
        is Event.Refresh -> when (state) {
            is Screen.Content -> state.copy(refreshing = true, notice = null, gen = event.gen)
            is Screen.Empty -> Screen.Loading(event.gen)
            else -> state
        }
        // @end
        // @piece retry: Retry only from the error screen
        is Event.Retry -> if (state is Screen.Error) Screen.Loading(event.gen) else state
        // @end
        // @piece success: An answer with orders, or with none
        is Event.Success -> if (event.items.isEmpty()) Screen.Empty(event.gen) else Screen.Content(event.items, refreshing = false, notice = null, gen = event.gen)
        // @end
        // @piece failure: A failed answer
        is Event.Failure -> if (state is Screen.Content) state.copy(refreshing = false, notice = event.message) else Screen.Error(event.message, event.gen)
        // @end
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// One event per line: start <gen> | refresh <gen> | retry <gen> | success <gen> [A,B,...] | failure <gen> <message>
fun parse(line: String): Event {
    val p = line.trim().split(" ", limit = 3)
    val gen = p[1].toInt()
    val rest = p.getOrElse(2) { "" }
    return when (p[0]) {
        "start" -> Event.Start(gen)
        "refresh" -> Event.Refresh(gen)
        "retry" -> Event.Retry(gen)
        "success" -> Event.Success(gen, if (rest.isBlank()) emptyList() else rest.split(","))
        "failure" -> Event.Failure(gen, rest)
        else -> error("unknown event ${p[0]}")
    }
}

fun main() {
    var state: Screen = Screen.Loading(0)
    for (line in generateSequence(::readLine)) {
        if (line.isBlank()) continue
        state = next(state, parse(line))
        println("${line.trim()} -> $state")
    }
}
