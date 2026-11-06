// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-1-1",
    title: "Unidirectional data flow and reducers",
    slug: { _type: "slug", current: "kotlin-unidirectional-data-flow-reducers" },
    description:
        "The courier app's Deliveries screen kept six independent LiveData fields written from nine places, and a failed refresh left the spinner turning and an old error over fresh data. Learn unidirectional data flow on Android - one immutable UI state, actions, a pure reducer and StateFlow.update - and write the screen's reducer.",
    estimatedTime: 15,

    scenario: {
        role: "Android developer on the Rice Rocket courier app",
        problem:
            "Couriers in Ho Chi Minh City see their assigned deliveries on one screen, filter them and mark pickups. Support kept receiving screenshots of impossible screens: a spinner over a full list that never stops, and a red 'timeout' banner over orders that had just loaded fine.",
    },

    content: [
        h2("Situation"),
        p("The Deliveries ViewModel grew one field per feature. Every callback set the fields it remembered:"),
        code("kotlin", `
class DeliveriesViewModel(private val api: DeliveriesApi) : ViewModel() {
    val isLoading = MutableLiveData(false)
    val isRefreshing = MutableLiveData(false)
    val error = MutableLiveData<String?>(null)
    val orders = MutableLiveData<List<Order>>(emptyList())
    val filter = MutableLiveData("all")

    fun refresh() = viewModelScope.launch {
        isRefreshing.value = true
        try {
            orders.value = api.assigned()
            isRefreshing.value = false
        } catch (e: IOException) {
            error.value = "timeout"            // isRefreshing is never reset
        }
    }
}`, "DeliveriesViewModel.kt"),
        bullets([
            "Bug RR-412: after a failed pull-to-refresh the spinner turns forever.",
            "The next successful load shows fresh orders under the old `timeout` banner, because nothing clears `error`.",
            "A filter chip tapped during a refresh is sometimes undone when the orders arrive.",
        ]),

        h2("The core you need"),
        bullets([
            "**Unidirectional data flow.** State flows down to the UI; events flow up to the ViewModel. The screen never changes state itself: it calls `viewModel.onAction(...)` and draws whatever state comes back.",
            "**One immutable UI state.** A single `data class DeliveriesState` holds everything the screen draws. Changing it means `copy(...)` into a new value, so no half-updated object is ever visible.",
            "**Actions and a reducer.** A `sealed interface Action` names everything that can happen (load, loaded, failed, refresh, filter, pickup). `reduce(state, action)` is a pure function returning the next state; `when` over a sealed type must cover every action, and the compiler says which one is missing.",
            "**StateFlow and `update`.** The ViewModel keeps a private `MutableStateFlow` and exposes `asStateFlow()`. `_state.update { reduce(it, action) }` applies the function atomically (it retries on a concurrent change), so two coroutines cannot overwrite each other's update.",
            "**Collect with the lifecycle.** Compose reads it with `collectAsStateWithLifecycle()`, which stops collecting while the app is in the background.",
            "**What StateFlow is not.** It keeps only the latest value and skips equal values. That is right for what the screen shows; it is wrong for things that must happen once (lesson 3).",
        ]),

        h2("Apply it in the project"),
        p("The state, the actions and the reducer live in one plain Kotlin file with no Android imports, so they run in a JVM unit test:"),
        code("kotlin", `
data class DeliveriesState(
    val orders: List<Order> = emptyList(),
    val filter: String = "all",
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
)

sealed interface Action {
    data object Load : Action
    data object Refresh : Action
    data class Loaded(val orders: List<Order>) : Action
    data class LoadFailed(val message: String) : Action
    data class FilterChanged(val filter: String) : Action
    data class PickedUp(val orderId: String) : Action
}

fun reduce(state: DeliveriesState, action: Action): DeliveriesState = when (action) {
    is Action.Load -> state.copy(loading = true, error = null)
    is Action.Refresh -> state.copy(refreshing = true, error = null)
    is Action.Loaded -> state.copy(orders = action.orders, loading = false, refreshing = false, error = null)
    is Action.LoadFailed -> state.copy(loading = false, refreshing = false, error = action.message)
    is Action.FilterChanged -> state.copy(filter = action.filter)
    is Action.PickedUp -> state.copy(orders = state.orders.map {
        if (it.id == action.orderId) it.copy(status = "picked") else it
    })
}`, "DeliveriesReducer.kt"),
        p("The ViewModel only dispatches actions and runs side effects (network calls), which produce more actions:"),
        code("kotlin", `
class DeliveriesViewModel(private val api: DeliveriesApi) : ViewModel() {
    private val _state = MutableStateFlow(DeliveriesState())
    val state: StateFlow<DeliveriesState> = _state.asStateFlow()

    fun onAction(action: Action) {
        _state.update { reduce(it, action) }
        if (action is Action.Load || action is Action.Refresh) fetch()
    }

    private fun fetch() = viewModelScope.launch {
        val result = runCatching { api.assigned() }
        onAction(result.fold({ Action.Loaded(it) }, { Action.LoadFailed(it.message ?: "error") }))
    }
}

@Composable
fun DeliveriesScreen(viewModel: DeliveriesViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    DeliveriesContent(state, onAction = viewModel::onAction)
}`, "DeliveriesViewModel.kt"),
        callout("info", "MVI, Redux, Orbit...",
            "Libraries and patterns with these names all wrap the same idea: one state, actions, a reducer. Start with the plain version; adopt a library when you need its extras (middleware, time travel, saved state)."),

        h2("Verify"),
        code("kotlin", `
class DeliveriesReducerTest {
    @Test fun failedRefreshStopsTheSpinnerAndKeepsTheList() {
        val loaded = reduce(DeliveriesState(), Action.Loaded(listOf(Order("O1", "new"))))
        val failed = reduce(reduce(loaded, Action.Refresh), Action.LoadFailed("timeout"))
        assertEquals(false, failed.refreshing)
        assertEquals("timeout", failed.error)
        assertEquals(loaded.orders, failed.orders)
    }
}`, "DeliveriesReducerTest.kt"),
        code("bash", `
./gradlew :feature:deliveries:testDebugUnitTest --tests '*DeliveriesReducerTest*'
# BUILD SUCCESSFUL in 6s
# 1 test completed`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`else ->` in the reducer.** It silences the exhaustiveness check, so a new action compiles and does nothing. Detect it by searching reducers for `else ->`; list every action instead.",
            "**Side effects inside `reduce`.** Logging, network calls or `Random` in the reducer make it untestable and can run twice when `update` retries. Keep effects in the ViewModel and feed their results back as actions.",
            "**Derived values stored in state.** Storing the filtered list next to `orders` and `filter` lets them disagree. Compute it (`visibleOrders(state)`) or store only the inputs.",
        ]),

        challenge("chal_quiz_kma_111"),
        p("Now write the reducer. The editor starts from the Deliveries file with every branch of `reduce` missing, each marked by a `// [ ]` line; until all branches are in place the compiler reports that `when` is not exhaustive. Click a piece to fill a line, or drag it onto one. Some pieces repeat the old ViewModel's bugs on purpose. Run feeds a list of actions to the reducer and prints what the screen would show after each one."),
        challenge("chal_coding_kma_112"),
    ],
});
