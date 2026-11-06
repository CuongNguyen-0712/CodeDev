// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-3-2",
    title: "Testing view models with a fake clock",
    slug: { _type: "slug", current: "kotlin-viewmodel-tests-fake-clock" },
    description:
        "The courier signal banner's tests waited in real time: four minutes per run, and red whenever CI was slow. Learn how virtual time works in kotlinx-coroutines-test, how to make a view model's timers testable, and build the scheduler behind a fake clock yourself.",
    estimatedTime: 16,

    scenario: {
        role: "Android developer on Rice Rocket's courier app, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Dispatch sees a banner per courier: LIVE while locations arrive, STALE after 2 minutes without one, OFFLINE after 3 more. Its view model used real delays, so its tests slept for minutes and still failed on a busy CI runner.",
    },

    content: [
        h2("Situation"),
        code("kotlin", `
@Test fun goesStaleAfterTwoMinutes() {
    val vm = CourierSignalViewModel()
    vm.onLocation()
    Thread.sleep(121_000)                          // wait for the real timer
    assertEquals("STALE", vm.banner.value)
}`, "CourierSignalViewModelTest.kt (before)"),
        code("text", `
CourierSignalViewModelTest > goesStaleAfterTwoMinutes PASSED (2m 1s)
CourierSignalViewModelTest > goesOfflineAfterFiveMinutes FAILED (5m 0s)
    expected:<OFFLINE> but was:<STALE>       (the CI runner was 300 ms late)
BUILD FAILED in 7m 12s`, "CI log"),

        h2("The core you need"),
        bullets([
            "**Virtual time.** In tests, `delay(120_000)` should not wait two minutes; it should register \"run this at t + 120000\" on a scheduler that the test moves forward. kotlinx-coroutines-test does this: `runTest` uses a `TestCoroutineScheduler` whose clock only moves when the test (or the end of the test) says so.",
            "**Moving the clock.** `advanceTimeBy(ms)` runs every task due before the new time, in time order, each at its own time; `runCurrent()` runs what is due now; `advanceUntilIdle()` runs everything left. Tasks that a task schedules run too if they fall in the window.",
            "**Same dispatcher everywhere.** The view model must run on the test's scheduler: inject the dispatcher, or call `Dispatchers.setMain(StandardTestDispatcher(testScheduler))` for code on `viewModelScope`. Real `Thread.sleep` or a background dispatcher escapes virtual time.",
            "**Order is part of the contract.** Two tasks due at the same moment run in the order they were scheduled, and a cancelled `Job` never runs. A view model that cancels its STALE timer on a new location depends on both.",
            "**Flows.** Collect `StateFlow` values into a list or use a helper like Turbine to assert the sequence of states, not just the last one.",
        ]),

        h2("Apply it in the project"),
        code("kotlin", `
class CourierSignalViewModel(private val io: CoroutineDispatcher = Dispatchers.Default) : ViewModel() {
    private val _banner = MutableStateFlow("WAITING")
    val banner: StateFlow<String> = _banner
    private var timer: Job? = null

    fun onLocation() {
        _banner.value = "LIVE"
        timer?.cancel()
        timer = viewModelScope.launch(io) {
            delay(120_000); _banner.value = "STALE"
            delay(180_000); _banner.value = "OFFLINE"
        }
    }
}

class CourierSignalViewModelTest {
    @Test fun staleThenOffline() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val vm = CourierSignalViewModel(io = StandardTestDispatcher(testScheduler))
        vm.onLocation()
        advanceTimeBy(120_001); assertEquals("STALE", vm.banner.value)
        advanceTimeBy(180_000); assertEquals("OFFLINE", vm.banner.value)
        Dispatchers.resetMain()
    }
}`, "CourierSignalViewModel.kt, CourierSignalViewModelTest.kt"),
        callout("info", "Why the challenge builds the scheduler itself",
            "The code runner has kotlinx.coroutines but not kotlinx-coroutines-test, so the challenge hides timers behind a small `Scheduler` interface and you write the fake. It is the same idea, made explicit: a queue ordered by time and call order, and a clock that jumps to each task. One difference on purpose: this fake also runs tasks due exactly at the new time, as if `advanceTimeBy` and `runCurrent` were one call."),

        h2("Verify"),
        code("bash", `
./gradlew :feature:dispatch:testDebugUnitTest --tests '*CourierSignalViewModelTest*'
# CourierSignalViewModelTest > staleThenOffline PASSED (14 ms)
# CourierSignalViewModelTest > newLocationCancelsStale PASSED (3 ms)
# BUILD SUCCESSFUL in 5s                  (was 7m 12s with Thread.sleep)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Work that escapes the test dispatcher.** A hard-coded `Dispatchers.IO` inside the view model runs on real threads, so `advanceTimeBy` does nothing for it and the test hangs or flakes. Inject the dispatcher.",
            "**Asserting at the exact boundary.** With `advanceTimeBy(120_000)` a task due at 120000 has not run yet in kotlinx-coroutines-test (tasks strictly before the new time run); advance one more millisecond or call `runCurrent()`. Read the docs of your version for the exact rule.",
            "**Forgetting `resetMain`.** A leaked test `Main` dispatcher breaks the next test class. Use a JUnit rule or `@After` to reset it.",
        ]),

        p("Now build the fake. The editor starts from `FakeScheduler.kt` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run drives the real banner view model and some labelled tasks on your scheduler and prints what happened at which virtual millisecond."),
        challenge("chal_coding_kma_182"),
    ],
});
