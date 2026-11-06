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
    // [ ] Answers to an older request change nothing
    return when (event) {
        // [ ] Opening the screen starts a fresh request
        // [ ] Refresh keeps content on screen, reloads an empty one
        // [ ] Retry only from the error screen
        // [ ] An answer with orders, or with none
        // [ ] A failed answer
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
