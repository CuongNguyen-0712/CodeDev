// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-3-1",
    title: "Dependency inversion for testable features",
    slug: { _type: "slug", current: "kotlin-dependency-inversion-testable" },
    description:
        "The courier app's Today earnings card counted late deliveries into tomorrow on phones set to UTC, and its tests passed or failed depending on the hour CI ran them. Learn to hand a feature its data source and its clock through the constructor, provide the real ones with Hilt, and test the logic with fakes and a fixed clock.",
    estimatedTime: 15,

    scenario: {
        role: "Android developer on Rice Rocket's courier app, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Couriers are paid per business day in Ho Chi Minh City. The Today card created its own api client and read the phone's clock and time zone, so it was wrong on some phones, untestable without the network, and flaky around midnight.",
    },

    content: [
        h2("Situation"),
        code("kotlin", `
class EarningsViewModel : ViewModel() {
    private val api = RetrofitClient.create<EarningsApi>()          // real network in every test
    fun today(): Today {
        val start = Instant.now().truncatedTo(ChronoUnit.DAYS)      // UTC midnight = 07:00 in HCMC
        val all = runBlocking { api.deliveriesSince(start) }
        val done = all.filter { it.status == "DELIVERED" && !it.deliveredAt.isAfter(start.plus(1, ChronoUnit.DAYS)) }
        return Today(LocalDate.now(ZoneId.systemDefault()), done.size, done.sumOf { it.fee + it.tip })
    }
}`, "EarningsViewModel.kt (before)"),
        bullets([
            "Deliveries between 00:00 and 07:00 local time went to the previous day, and the date on the card followed the phone's zone.",
            "`EarningsViewModelTest` called the staging api and passed or failed depending on the hour the CI job ran.",
            "A delivery stamped exactly at midnight counted in two days (`!isAfter(end)` includes the end).",
        ]),

        h2("The core you need"),
        bullets([
            "**Depend on what you own.** The calculator needs \"deliveries since an instant\" and \"the current time\". Express them as an interface you define (`DeliverySource`) and `java.time.Clock`, not as Retrofit and the system clock.",
            "**Pass dependencies in through the constructor.** No `create()` or `now()` inside: the caller decides. In the app Hilt provides the real ones; in a test you call the constructor with fakes, no framework needed.",
            "**Time is a dependency.** `Clock.fixed(instant, zone)` freezes time for a test; `LocalDate.now(clock)` and `Instant.now(clock)` read it. The app passes `Clock.systemUTC()`.",
            "**The business zone is a rule, not a device setting.** Rice Rocket pays by the day in `Asia/Ho_Chi_Minh`: `clock.withZone(BUSINESS_ZONE)` gives today's date, `day.atStartOfDay(BUSINESS_ZONE)` its start, whatever zone the phone uses.",
            "**Half-open intervals.** A day is `[start, nextStart)`: include the start, exclude the next midnight, so no instant belongs to two days.",
        ]),

        h2("Apply it in the project"),
        code("kotlin", `
interface DeliverySource { suspend fun deliveriesSince(since: Instant): List<Delivery> }

class EarningsCalculator @Inject constructor(private val source: DeliverySource, private val clock: Clock) {
    suspend fun today(): Today {
        val day = LocalDate.now(clock.withZone(BUSINESS_ZONE))
        val start = day.atStartOfDay(BUSINESS_ZONE).toInstant()
        val end = day.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant()
        val done = source.deliveriesSince(start)
            .filter { it.status == "DELIVERED" && !it.deliveredAt.isBefore(start) && it.deliveredAt.isBefore(end) }
        return Today(day, start, done.size, done.sumOf { it.fee + it.tip })
    }
}

@Module @InstallIn(SingletonComponent::class)
abstract class EarningsModule {
    @Binds abstract fun source(api: ApiDeliverySource): DeliverySource
    companion object { @Provides fun clock(): Clock = Clock.systemUTC() }
}`, "EarningsCalculator.kt"),
        code("kotlin", `
class EarningsCalculatorTest {
    private val fake = object : DeliverySource {
        var all = listOf<Delivery>()
        override suspend fun deliveriesSince(since: Instant) = all
    }

    @Test fun lateNightCountsForToday() = runTest {
        fake.all = listOf(delivery("2026-03-14T16:30:00Z", fee = 40_000, tip = 10_000))
        val calc = EarningsCalculator(fake, Clock.fixed(Instant.parse("2026-03-14T16:40:00Z"), ZoneOffset.UTC))
        assertEquals(50_000, calc.today().earned)              // 23:40 in HCMC, same business day
    }
}`, "EarningsCalculatorTest.kt"),
        callout("info", "Fakes over mocks here",
            "A fake source is ten lines and behaves like a tiny api; a mock that verifies calls breaks when you change how the calculator asks. Keep mocks for checking that something was called, fakes for supplying data."),

        h2("Verify"),
        code("bash", `
./gradlew :feature:earnings:testDebugUnitTest
# EarningsCalculatorTest > lateNightCountsForToday PASSED
# EarningsCalculatorTest > midnightBelongsToTomorrow PASSED
# BUILD SUCCESSFUL in 6s          (was 2m 40s against the staging api)
TZ=UTC ./gradlew :feature:earnings:testDebugUnitTest      # same result in any machine zone`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A hidden `now()`.** One `Instant.now()` or `LocalDate.now()` without the clock makes the test depend on the hour again. Search the module for `now()` calls without an argument.",
            "**Using the device zone for business rules.** `ZoneId.systemDefault()` is right for showing a time to the user, wrong for deciding which pay day a delivery belongs to. Run the tests with `TZ=UTC` and `TZ=Asia/Ho_Chi_Minh`; results must match.",
            "**Faking too much.** Faking the calculator itself in a view model test hides the logic you wanted to check. Fake the edges (network, clock, storage) and run the real logic.",
        ]),

        p("Now fix the card. The editor starts from `EarningsCalculator.kt` with the date logic cut out, each block marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are last month's code. Run feeds a fixed clock in UTC and a fake source with deliveries around midnight and prints the day, its start, the count and the total."),
        challenge("chal_coding_kma_172"),
    ],
});
