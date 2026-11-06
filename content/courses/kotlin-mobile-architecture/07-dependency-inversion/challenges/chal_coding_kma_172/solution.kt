// Rice Rocket courier app: the "Today" card on the earnings screen.
// A courier's day is the business day in Ho Chi Minh City (UTC+7), whatever zone the phone uses.
// Today's earnings = fee + tip of DELIVERED orders delivered in [start of today, start of tomorrow).
// The calculator gets its data source and its clock from outside: the app passes the api and
// Clock.systemUTC(), tests pass a fake source and Clock.fixed(...).
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

data class Delivery(val id: String, val deliveredAt: Instant, val fee: Long, val tip: Long, val status: String)

/** Where deliveries come from: the api in the app, a fake in tests. */
interface DeliverySource {
    fun deliveriesSince(since: Instant): List<Delivery>
}

data class Today(val day: LocalDate, val since: Instant, val count: Int, val earned: Long)

val BUSINESS_ZONE: ZoneId = ZoneId.of("Asia/Ho_Chi_Minh")

class EarningsCalculator(private val source: DeliverySource, private val clock: Clock) {
    fun today(): Today {
        // @piece business-day: Today's date on the injected clock, in the business zone
        val day = LocalDate.now(clock.withZone(BUSINESS_ZONE))
        // @end
        // @piece day-bounds: Where today starts and tomorrow starts
        val start = day.atStartOfDay(BUSINESS_ZONE).toInstant()
        val end = day.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant()
        // @end
        // @piece count-delivered: Delivered orders inside [start, end)
        val done = source.deliveriesSince(start)
            .filter { it.status == "DELIVERED" && !it.deliveredAt.isBefore(start) && it.deliveredAt.isBefore(end) }
        // @end
        return Today(day, start, done.size, done.sumOf { it.fee + it.tip })
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: "now <instant>" then "delivery <id> <instant> <fee> <tip> <STATUS>" lines.
// The fake source returns everything it holds: the calculator must not rely on the api's filter.
// The fixed clock's own zone is UTC, like an emulator or a CI machine.
fun main() {
    var now: Instant? = null
    val all = mutableListOf<Delivery>()
    for (raw in generateSequence(::readLine)) {
        val p = raw.trim().split(" ")
        when (p[0]) {
            "now" -> now = Instant.parse(p[1])
            "delivery" -> all += Delivery(p[1], Instant.parse(p[2]), p[3].toLong(), p[4].toLong(), p[5])
            "" -> {}
            else -> error("unknown line: $raw")
        }
    }
    val source = object : DeliverySource {
        override fun deliveriesSince(since: Instant) = all.toList()
    }
    val today = EarningsCalculator(source, Clock.fixed(now!!, ZoneOffset.UTC)).today()
    println("day ${today.day}")
    println("since ${today.since}")
    println("deliveries ${today.count}")
    println("earned ${today.earned}")
}
