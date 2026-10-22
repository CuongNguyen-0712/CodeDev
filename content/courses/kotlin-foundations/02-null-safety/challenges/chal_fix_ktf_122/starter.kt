// Cho Xanh - the header of the cart screen.
//
// Release 4.13 crashes the cart for every customer whose profile is incomplete:
// customers who signed up with Zalo have no display name, many have no address yet,
// and some addresses have no street or no ward. Fix greeting, deliverTo and deliveryFee
// so that no profile crashes the screen. Do not use !! in your fix.
//
// Input (stdin): one profile per line, fields separated by "|", "-" means "missing" (null):
//   ID|DISPLAY_NAME|DISTRICT|WARD|STREET
//   e.g. CX-U01|Lan|Hoan Kiem|Hang Bac|12 Hang Bac
//   A profile without a district has no address at all (the ward and street are ignored).
//
// Output, one line per profile (the test runner prints it):
//   CX-U01: Hi Lan | Deliver to: 12 Hang Bac, Hang Bac, Hoan Kiem | Fee: 15000 VND
//
// Rules:
//   greeting      "Hi " + the display name without spaces around it.
//                 "Hi there" when there is no display name, or it is empty or only spaces.
//   deliverTo     "Deliver to: " + street, ward and district, separated by ", ",
//                 skipping the parts that are missing: "Deliver to: Hang Bac, Hoan Kiem".
//                 "Deliver to: add an address" when there is no address.
//   deliveryFee   the fee of the address's district from FEES, e.g. "15000 VND".
//                 "n/a" when there is no address or the district is outside FEES.

data class Address(val street: String?, val ward: String?, val district: String)

data class Profile(val id: String, val displayName: String?, val address: Address?)

val FEES = mapOf(
    "Hoan Kiem" to 15_000,
    "Ba Dinh" to 15_000,
    "Dong Da" to 20_000,
    "Cau Giay" to 20_000,
    "Long Bien" to 25_000,
)

fun greeting(p: Profile): String {
    return "Hi ${p.displayName!!.trim()}"
}

fun deliverTo(p: Profile): String {
    val address = p.address!!
    return "Deliver to: ${address.street!!}, ${address.ward!!}, ${address.district}"
}

fun deliveryFee(p: Profile): String {
    val fee = FEES[p.address!!.district]!!
    return "$fee VND"
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    for (line in generateSequence(::readLine)) {
        if (line.isBlank()) continue
        val f = line.split("|").map { if (it == "-") null else it }
        val district = f[2]
        val address = if (district == null) null else Address(street = f[4], ward = f[3], district = district)
        val p = Profile(f[0] ?: "?", f[1], address)
        println("${p.id}: ${greeting(p)} | ${deliverTo(p)} | Fee: ${deliveryFee(p)}")
    }
}
