// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-2-3",
    title: "Optimistic updates and rollback",
    slug: { _type: "slug", current: "kotlin-optimistic-updates-rollback" },
    description:
        "Rice Rocket's couriers tapped Picked up twice because the button waited seconds for the api, then the first optimistic version kept refused changes on screen and flickered on every push. Learn to keep the server state and the pending changes apart, show one on top of the other, and confirm, roll back or rebase each change precisely.",
    estimatedTime: 16,

    scenario: {
        role: "Android developer on Rice Rocket's courier app, a food-delivery startup in Ho Chi Minh City",
        problem:
            "On a weak 3G signal, Picked up and Delivered took two to six seconds to answer, so couriers tapped again. Making the buttons optimistic fixed the wait but brought two new bugs: refused changes stayed on screen, and pushes from the api made orders jump back.",
    },

    content: [
        h2("Situation"),
        p("Three days of support tickets after the courier app switched to optimistic taps:"),
        code("text", `
12:04:10  tap m-81 order 5521 PICKED_UP        shown at once
12:04:11  POST /orders/5521/pickup -> 409 {"error":"order reassigned"}
12:04:11  failure for m-81 ignored             screen still says PICKED_UP
12:20:01  tap m-90 order 5530 PICKED_UP        shown at once
12:20:01  push order 5530 status=ASSIGNED      pending change cleared, screen shows ASSIGNED
12:20:02  POST /orders/5530/pickup -> 200      screen shows PICKED_UP again
12:31:44  tap m-95 / tap m-96 order 5544 PICKED_UP   two requests sent`, "logcat (trimmed)"),
        bullets([
            "A refused pick-up stayed on screen until the app restarted; the customer was told a courier had the food.",
            "Pushes for an order with a pending change made it flicker back, and couriers tapped again.",
            "A fast double tap still sent two requests, because the tap check read the server state instead of the screen.",
        ]),

        h2("The core you need"),
        bullets([
            "**Two things, never one.** Keep the last server state (a Room table refreshed by the api) and the list of pending changes (a second table, so they survive process death) apart. Neither is the screen on its own.",
            "**The screen is derived.** `combine(serverOrders, pendingChanges)` folds the pending list, in order, over a copy of the server state and exposes it as a `StateFlow`. A star or a spinner marks orders with a pending change.",
            "**Accept only the next step of what the courier sees.** A tap is checked against the derived state: a second Picked up while the first is pending is not the next step, so it is ignored without a disabled-button race.",
            "**Each change has a client mutation id.** It is generated on the phone and sent as the idempotency key, so a retry after a lost response does not pick the order up twice.",
            "**Three ways a change leaves the list.** Confirmed: it moves into the server state. Refused: it is removed together with the later changes for the same order that depended on it, and the courier gets a one-off message. A push or refresh: replaces the server state only; the pending change stays on top until its own answer arrives (a rebase).",
        ]),

        h2("Apply it in the project"),
        p("The data layer of the order list, with Room as the store and WorkManager sending the queue:"),
        code("kotlin", `
@Entity(tableName = "order_server") data class OrderRow(@PrimaryKey val id: String, val status: Status)
@Entity(tableName = "order_pending") data class PendingRow(
    @PrimaryKey val mutationId: String, val orderId: String, val to: Status, val createdAt: Long,
)

class OrderRepository(private val dao: OrderDao, private val api: OrderApi, private val work: WorkManager) {
    val orders: Flow<List<OrderUi>> = combine(dao.serverOrders(), dao.pending()) { server, pending ->
        val shown = server.associate { it.id to it.status }.toMutableMap()
        pending.sortedBy { it.createdAt }.forEach { shown[it.orderId] = it.to }
        shown.map { (id, s) -> OrderUi(id, s, pending.any { it.orderId == id }) }
    }

    suspend fun tap(orderId: String, to: Status) {
        val current = orders.first().firstOrNull { it.id == orderId } ?: return
        if (to.ordinal != current.status.ordinal + 1) return          // double tap, stale button
        val change = PendingRow(UUID.randomUUID().toString(), orderId, to, System.currentTimeMillis())
        dao.insertPending(change)
        work.enqueue(SendChangeWorker.request(change.mutationId))    // retries keep the same id
    }

    suspend fun onPush(orderId: String, status: Status) = dao.upsertServer(OrderRow(orderId, status))

    suspend fun onAnswer(mutationId: String, result: ApiResult) = dao.withTransaction {
        val change = dao.pendingById(mutationId) ?: return@withTransaction
        when (result) {
            is ApiResult.Ok -> { dao.deletePending(mutationId); dao.upsertServer(OrderRow(change.orderId, result.status)) }
            is ApiResult.Refused -> {
                dao.deletePendingFrom(change.orderId, change.createdAt)        // this one and later ones
                events.send(UiEvent.Message("Could not mark \${change.orderId} \${change.to}: \${result.reason}"))
            }
        }
    }
}`, "OrderRepository.kt"),
        callout("info", "Why not just disable the button?",
            "A disabled button covers the tap, not the network. The change can be sent twice by a retry, and the screen still needs to know what to show while it waits. The pending list answers both."),

        h2("Verify"),
        code("bash", `
./gradlew :feature:orders:testDebugUnitTest --tests '*OrderRepositoryTest*'
# OrderRepositoryTest > refused change rolls back and later change is dropped PASSED
# OrderRepositoryTest > push keeps pending change on screen PASSED
# OrderRepositoryTest > double tap sends one request PASSED
adb shell cmd connectivity airplane-mode enable    # tap Picked up offline: star shows, nothing lost
adb shell cmd connectivity airplane-mode disable   # WorkManager sends it with the same mutation id`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Writing the guess into the server table.** Saving the optimistic status as if the server had said it leaves nothing to roll back to. Detect it with a test that refuses a change: the screen must show the old status again.",
            "**Clearing pending changes on every push.** The push predates the change, so the order flickers back. Detect it in logs: a push followed by the same tap's success within a second.",
            "**Forgetting dependent changes.** If Picked up is refused, a queued Delivered for the same order is meaningless. Drop the later changes for that order and say how many were dropped.",
        ]),

        challenge("chal_quiz_kma_161"),
        p("Now write the store. The editor starts from `OrderStore.kt` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the three bugs above on purpose. Run plays taps, answers and pushes through the store and prints every request, rollback message and screen."),
        challenge("chal_coding_kma_162"),
    ],
});
