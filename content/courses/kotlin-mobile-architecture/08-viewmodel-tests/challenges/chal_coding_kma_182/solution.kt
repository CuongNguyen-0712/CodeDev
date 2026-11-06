// Rice Rocket courier app: testing the "courier signal" banner without waiting in real time.
// The view model only talks to a Scheduler. The app passes one backed by coroutines (delay on the
// main dispatcher); tests pass this FakeScheduler, a virtual clock that works like
// kotlinx-coroutines-test's TestCoroutineScheduler: advanceTimeBy runs every task that falls due,
// in time order, each at its own time, including tasks scheduled by the tasks it runs.

interface Cancellable {
    fun cancel()
}

interface Scheduler {
    val now: Long
    fun after(delayMs: Long, task: () -> Unit): Cancellable
}

class FakeScheduler : Scheduler {
    private class Task(val at: Long, val seq: Long, val run: () -> Unit) {
        var cancelled = false
    }

    private val queue = mutableListOf<Task>()
    private var nextSeq = 0L
    override var now = 0L
        private set

    override fun after(delayMs: Long, task: () -> Unit): Cancellable {
        require(delayMs >= 0) { "negative delay" }
        // @piece schedule: Queue the task at now + delay, numbered in call order
        val t = Task(now + delayMs, nextSeq++, task)
        queue += t
        // @end
        // @piece cancel-handle: A handle that stops the task from ever running
        return object : Cancellable {
            override fun cancel() {
                t.cancelled = true
            }
        }
        // @end
    }

    /** Runs every task due up to now + ms, each at its own time, then leaves the clock at now + ms. */
    fun advanceTimeBy(ms: Long) {
        val target = now + ms
        while (true) {
            // @piece next-due: The earliest live task due by the target, first queued first
            queue.removeAll { it.cancelled }
            val next = queue.filter { it.at <= target }.minWithOrNull(compareBy<Task>({ it.at }, { it.seq })) ?: break
            // @end
            // @piece run-at-its-time: Move the clock to the task's time, then run it
            queue.remove(next)
            now = next.at
            next.run()
            // @end
        }
        now = target
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// The view model under test: LIVE on a location, STALE after 2 minutes without one, OFFLINE after
// 3 more minutes. A new location cancels the pending timer.
class CourierSignalViewModel(private val scheduler: Scheduler, private val log: MutableList<String>) {
    var banner = "WAITING"
        private set
    private var timer: Cancellable? = null

    private fun show(b: String) {
        if (b == banner) return
        banner = b
        log += "[${scheduler.now}] $b"
    }

    fun onLocation() {
        show("LIVE")
        timer?.cancel()
        timer = scheduler.after(120_000) {
            show("STALE")
            timer = scheduler.after(180_000) { show("OFFLINE") }
        }
    }
}

// Commands: location | advance <ms> | task <label> <delay> | chain <label> <delay> <then>
fun main() {
    val scheduler = FakeScheduler()
    val log = mutableListOf<String>()
    val vm = CourierSignalViewModel(scheduler, log)
    for (raw in generateSequence(::readLine)) {
        val p = raw.trim().split(" ")
        when (p[0]) {
            "location" -> vm.onLocation()
            "advance" -> scheduler.advanceTimeBy(p[1].toLong())
            "task" -> scheduler.after(p[2].toLong()) { log += "[${scheduler.now}] ${p[1]}" }
            "chain" -> scheduler.after(p[2].toLong()) {
                log += "[${scheduler.now}] ${p[1]}"
                scheduler.after(p[3].toLong()) { log += "[${scheduler.now}] ${p[1]}-next" }
            }
            "" -> {}
            else -> error("unknown command: $raw")
        }
    }
    log.forEach(::println)
    println("now=${scheduler.now} banner=${vm.banner}")
}
