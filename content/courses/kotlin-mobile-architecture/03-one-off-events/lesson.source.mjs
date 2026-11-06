// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-1-3",
    title: "One-off events vs state",
    slug: { _type: "slug", current: "kotlin-one-off-events-vs-state" },
    description:
        "The courier app reopened the delivery screen after every rotation and lost an 'order cancelled' message while the courier had the maps app open. Learn how Android apps deliver one-off events - pending messages in the state acknowledged by id, or a buffered Channel - and why StateFlow and SharedFlow alone repeat or drop them; then fix the message queue.",
    estimatedTime: 15,

    scenario: {
        role: "Android developer on the Rice Rocket courier app",
        problem:
            "A courier drove 3 km to a restaurant for an order the customer had cancelled: the push arrived while the courier was navigating in the maps app, and the app never showed it. Others reported the delivery screen opening again on its own after they turned the phone.",
    },

    content: [
        h2("Situation"),
        p("Two attempts, two different bugs. First, navigation as plain state:"),
        code("kotlin", `
data class OrdersState(val navigateTo: String? = null)

LaunchedEffect(state.navigateTo) {
    state.navigateTo?.let { navController.navigate("delivery/$it") }   // runs again after rotation
}`, "OrdersScreen.kt"),
        p("Then messages through a SharedFlow, which the screen only collects while it is started:"),
        code("kotlin", `
private val _messages = MutableSharedFlow<String>()       // no replay, no buffer

fun onCancelledByCustomer(id: String) = viewModelScope.launch {
    _messages.emit("Order $id was cancelled by the customer")   // dropped when nobody collects
}`, "CourierViewModel.kt"),
        bullets([
            "State that triggers an action and is never cleared repeats every time a new screen reads it.",
            "A SharedFlow without replay drops what is emitted while it has no subscribers, and a lifecycle-aware collector unsubscribes in the background.",
            "A single `lastMessage: String?` field kept only the newest of two quick messages.",
        ]),

        h2("The core you need"),
        bullets([
            "**State survives the UI, events must not repeat.** The ViewModel outlives rotation, so whatever is in its state is read again by the new screen. Something that must happen once needs a way to say 'done'.",
            "**Pending messages in the state (recommended for important events).** Keep `messages: List<UserMessage>` with an id per message. The screen shows the first one; when the courier dismisses it, the screen calls `messageShown(id)` and the reducer removes that id. Nothing is lost in the background (it stays in the list) and nothing repeats after dismissal.",
            "**Remove by id, never by position.** An acknowledgement can arrive twice (double tap, resent after recreation). Removing 'the first message' twice removes a message the courier never saw; removing by id is idempotent.",
            "**One state change for one fact.** 'Order cancelled' removes the order from the list and queues its message in the same `copy`, so the screen never shows the message next to an order that is still listed.",
            "**Channel for droppable UI effects.** `Channel(Channel.BUFFERED)` + `receiveAsFlow()` buffers while nobody collects and delivers each element to one collector. Good for a snackbar you can afford to lose in rare cancellation races; not for 'order cancelled'.",
            "**Not for events:** `StateFlow` (conflates and skips equal values) and `MutableSharedFlow()` without replay (drops values with no subscribers).",
        ]),

        h2("Apply it in the project"),
        code("kotlin", `
data class UserMessage(val id: Long, val text: String)

data class CourierState(
    val orders: List<String> = emptyList(),
    val messages: List<UserMessage> = emptyList(),
    val nextId: Long = 1,
)

fun withMessage(state: CourierState, text: String) =
    state.copy(messages = state.messages + UserMessage(state.nextId, text), nextId = state.nextId + 1)

fun orderCancelled(state: CourierState, orderId: String) =
    withMessage(state.copy(orders = state.orders - orderId), "Order $orderId was cancelled by the customer")

fun messageShown(state: CourierState, id: Long) =
    state.copy(messages = state.messages.filterNot { it.id == id })`, "CourierMessages.kt"),
        code("kotlin", `
@Composable
fun CourierScreen(viewModel: CourierViewModel, snackbar: SnackbarHostState) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    state.messages.firstOrNull()?.let { message ->
        LaunchedEffect(message.id) {
            snackbar.showSnackbar(message.text, withDismissAction = true)
            viewModel.onMessageShown(message.id)        // _state.update { messageShown(it, message.id) }
        }
    }
    OrdersList(state.orders)
}`, "CourierScreen.kt"),
        callout("info", "Navigation the same way",
            "For navigation, keep `navigateTo` in the state and have the screen call `onNavigated()` right after `navigate(...)`; the reducer clears it. Rotation then finds nothing to do."),

        h2("Verify"),
        code("kotlin", `
@Test fun repeatedAckKeepsTheNextMessage() {
    var s = orderAssigned(CourierState(), "O-2231")
    s = orderCancelled(s, "O-2231")
    val first = s.messages.first().id
    s = messageShown(messageShown(s, first), first)          // acknowledged twice
    assertEquals(listOf("Order O-2231 was cancelled by the customer"), s.messages.map { it.text })
}`, "CourierMessagesTest.kt"),
        p("On a device: open another app, trigger a cancellation push while the courier app is in the background, return, and the message must appear; rotate before dismissing it and it must appear again; rotate after dismissing and it must not."),

        h2("Pitfalls"),
        bullets([
            "**Acknowledging when shown instead of when dismissed.** Calling `messageShown` as soon as the snackbar starts loses the message if the app goes to the background before the courier reads it. Acknowledge after `showSnackbar` returns.",
            "**Unbounded queues.** A flapping connection can queue the same 'You are offline' message fifty times. Deduplicate by text or key in `withMessage` for status messages.",
            "**`replay = 1` as a fix.** A SharedFlow with replay redelivers the last event to every new collector, which is the rotation bug again.",
        ]),

        challenge("chal_quiz_kma_131"),
        p("Now fix the queue. The editor holds the message functions with their bodies missing, each marked by a `// [ ]` line; last week's buggy versions are among the pieces. Click a piece to fill a line, or drag it onto one. Run simulates the screen going to the background, rotating and the courier dismissing messages, and prints what is on screen after each step."),
        challenge("chal_coding_kma_132"),
    ],
});
