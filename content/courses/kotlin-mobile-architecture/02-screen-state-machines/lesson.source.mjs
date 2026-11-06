// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-1-2",
    title: "Screen state machines: loading, error and empty",
    slug: { _type: "slug", current: "kotlin-screen-state-machines" },
    description:
        "The Order history screen used an empty list to mean 'loading', offered Retry over a full list and let a late answer overwrite fresh data. Learn to model a screen as a sealed state machine - explicit states, allowed transitions, and request numbers that drop stale answers - and write the screen's transition function.",
    estimatedTime: 16,

    scenario: {
        role: "Android developer on the Rice Rocket courier app",
        problem:
            "Couriers check their order history to confirm payouts. On slow 3G the screen first showed the 'No deliveries yet' illustration, then a list; a pull-to-refresh that failed replaced the list with a full-screen error; and twice the list jumped back to older data seconds after a refresh.",
    },

    content: [
        h2("Situation"),
        p("The screen derived what to show from a few loose values:"),
        code("kotlin", `
data class HistoryState(
    val items: List<String> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

@Composable
fun HistoryContent(state: HistoryState) {
    when {
        state.error != null -> ErrorScreen(state.error, onRetry = ...)
        state.items.isEmpty() -> EmptyIllustration()      // also shown while the first load runs
        else -> OrderList(state.items)
    }
}`, "OrderHistoryScreen.kt"),
        bullets([
            "On a slow first load, `items` is empty and `loading` is true, but the `when` checks emptiness first: couriers saw 'No deliveries yet' and filed payout tickets.",
            "A failed refresh set `error`, and the error branch wins: the list the courier was reading disappeared.",
            "Request A (slow) and request B (pull-to-refresh) overlapped; A's answer arrived last and replaced B's newer list.",
        ]),

        h2("The core you need"),
        bullets([
            "**A screen is in exactly one state.** Name them as a `sealed interface`: `Loading`, `Content(items, refreshing, notice)`, `Empty`, `Error(message)`. A `when` over it has one branch per state, so 'empty while loading' cannot be expressed.",
            "**Transitions are a function.** `next(state, event)` decides the new state for each event in each state. Writing it as a table (state x event) shows which combinations are meaningful and which must be ignored, such as Retry while a list is shown.",
            "**Keep content on refresh.** Refresh is a flag on `Content`; a failed refresh becomes a `notice` on `Content`, not an `Error` screen. Only a failed first load gets the full-screen error.",
            "**Number every request.** The ViewModel increments a counter per request and the answer carries it back. An answer whose number is not the latest one is dropped before anything else, in every state. `collectLatest` or cancelling the previous job helps too, but an answer can still race a cancellation, so the number check stays.",
            "**Empty is a real state.** An empty answer goes to `Empty`, with its own illustration and a refresh action; it is not `Content` with no items.",
        ]),

        h2("Apply it in the project"),
        code("kotlin", `
sealed interface Screen {
    val gen: Int
    data class Loading(override val gen: Int) : Screen
    data class Content(val items: List<String>, val refreshing: Boolean, val notice: String?, override val gen: Int) : Screen
    data class Empty(override val gen: Int) : Screen
    data class Error(val message: String, override val gen: Int) : Screen
}

class OrderHistoryViewModel(private val api: HistoryApi) : ViewModel() {
    private val _state = MutableStateFlow<Screen>(Screen.Loading(0))
    val state = _state.asStateFlow()
    private var gen = 0

    fun onEvent(event: Event) = _state.update { next(it, event) }

    fun start() = request(Event::Start)
    fun refresh() = request(Event::Refresh)
    fun retry() = request(Event::Retry)

    private fun request(event: (Int) -> Event) {
        val number = ++gen
        onEvent(event(number))
        viewModelScope.launch {
            val answer = runCatching { api.history() }
            onEvent(answer.fold({ Event.Success(number, it) }, { Event.Failure(number, it.message ?: "error") }))
        }
    }
}`, "OrderHistoryViewModel.kt"),
        code("kotlin", `
@Composable
fun HistoryContent(screen: Screen, onRefresh: () -> Unit, onRetry: () -> Unit) {
    when (screen) {
        is Screen.Loading -> FullScreenSpinner()
        is Screen.Empty -> EmptyIllustration(onRefresh)
        is Screen.Error -> ErrorScreen(screen.message, onRetry)
        is Screen.Content -> PullToRefreshBox(isRefreshing = screen.refreshing, onRefresh = onRefresh) {
            OrderList(screen.items, notice = screen.notice)
        }
    }
}`, "OrderHistoryScreen.kt"),
        callout("info", "Where the transition table lives",
            "Keep `next` free of Android and coroutines, like the reducer in lesson 1. The ViewModel owns the counter and the network call; the function owns the rules, and its unit test reads like the table above."),

        h2("Verify"),
        code("kotlin", `
@Test fun lateAnswerToAnOlderRequestIsDropped() {
    var s: Screen = Screen.Loading(0)
    s = next(s, Event.Start(1))
    s = next(s, Event.Success(1, listOf("O-1041")))
    s = next(s, Event.Refresh(2))
    s = next(s, Event.Success(1, listOf("O-1041")))          // the slow first request, again
    assertEquals(Screen.Content(listOf("O-1041"), refreshing = true, notice = null, gen = 2), s)
}`, "OrderHistoryScreenTest.kt"),
        p("On an emulator, a slow network (Extended controls, Cellular, network type set to a slow profile such as GSM) reproduces the overlap: refresh twice quickly and the list must never jump back."),

        h2("Pitfalls"),
        bullets([
            "**`else -> state` everywhere.** A catch-all branch also swallows events you forgot to handle. Keep explicit branches for the events a state accepts, and one `else` only for 'ignore everything else'.",
            "**Comparing with the wrong number.** The guard compares the answer's number with the state's latest number, not with 'the request that is loading'. Checking only while `Loading` lets a late answer overwrite a refreshing list.",
            "**Process death.** After the system kills the app, the state restarts as `Loading`; persist what must survive with `SavedStateHandle`, not the transition flags.",
        ]),

        p("Write the transition function. The editor starts from the Order history file with the blocks of `next` missing, each marked by a `// [ ]` line; until every branch is there the compiler reports a non-exhaustive `when`. Click a piece to fill a line, or drag it onto one. Some pieces repeat the old screen's bugs on purpose. Run feeds a list of events and prints the state after each."),
        challenge("chal_coding_kma_122"),
    ],
});
