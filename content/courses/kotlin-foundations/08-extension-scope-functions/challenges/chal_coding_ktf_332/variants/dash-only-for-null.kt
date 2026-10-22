// Cho Xanh - the text of the "order on its way" notification.
//
// Write the four extension functions, then use them in Order.notificationText().
//
//   Long.vnd()           the amount with a comma every three digits, then " VND".
//                        1250000 -> "1,250,000 VND", 999 -> "999 VND", 0 -> "0 VND",
//                        -300000 -> "-300,000 VND" (refunds are negative). No Locale or String.format.
//   String.titleCase()   every word starts with an upper-case letter, the rest is lower-case,
//                        words are separated by exactly one space, no spaces around:
//                        "  nguyen   VAN an " -> "Nguyen Van An".
//   String.maskPhone()   keep the first 3 and the last 3 characters, replace the rest by "*":
//                        "0912345678" -> "091****678". A phone shorter than 7 characters is
//                        masked completely: "12345" -> "*****".
//   String?.orDash()     the text itself, or "-" when it is null, empty or only spaces.
//
//   Order.notificationText()
//     "Hi Nguyen Van An, order CX-1042 (1,250,000 VND) is on its way. Driver: Tuan (091****678). Note: -"
//     The customer and the driver names are title-cased, the driver's phone is masked,
//     a missing driver name, phone or note is shown as "-".
//
// Input (stdin), one line each, "-" means missing (null); the test runner parses it:
//   order|ID|CUSTOMER|AMOUNT|DRIVER|DRIVER_PHONE|NOTE   -> prints notificationText()
//   refund|ID|AMOUNT                                   -> prints "Refund for ID: " + AMOUNT.vnd()

data class Order(
    val id: String,
    val customer: String,
    val amount: Long,
    val driverName: String?,
    val driverPhone: String?,
    val note: String?,
)

fun Long.vnd(): String {
    if (this < 0) return "-" + (-this).vnd()
    val grouped = toString().reversed().chunked(3).joinToString(",").reversed()
    return "$grouped VND"
}

fun String.titleCase(): String =
    split(" ").filter { it.isNotEmpty() }.joinToString(" ") { word ->
        word.lowercase().replaceFirstChar { it.uppercase() }
    }

fun String.maskPhone(): String =
    if (length < 7) "*".repeat(length) else take(3) + "*".repeat(length - 6) + takeLast(3)

fun String?.orDash(): String = this ?: "-"

fun Order.notificationText(): String = buildString {
    append("Hi ${customer.titleCase()}, order $id (${amount.vnd()}) is on its way.")
    append(" Driver: ${driverName?.titleCase().orDash()} (${driverPhone?.maskPhone().orDash()}).")
    append(" Note: ${note.orDash()}")
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    for (line in generateSequence(::readLine)) {
        val f = line.split("|")
        fun optional(i: Int) = f[i].takeIf { it != "-" }
        when (f[0]) {
            "order" -> println(Order(f[1], f[2], f[3].toLong(), optional(4), optional(5), optional(6)).notificationText())
            "refund" -> println("Refund for ${f[1]}: ${f[2].toLong().vnd()}")
        }
    }
}
