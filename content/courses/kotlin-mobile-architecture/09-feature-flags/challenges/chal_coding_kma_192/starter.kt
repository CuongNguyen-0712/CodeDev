// Rice Rocket courier app: which couriers get a feature, decided on the phone from remote config.
// Checks in this order: kill switch, minimum app version, minimum Android SDK, the QA allowlist,
// then a stable percentage rollout: bucket = FNV-1a 32 of "<flagKey>:<courierId>", mod 100.

data class Flag(val key: String, val enabled: Boolean, val percent: Int, val minVersion: String, val minSdk: Int, val allow: Set<String>)
data class Courier(val id: String, val appVersion: String, val sdk: Int)
data class Decision(val on: Boolean, val reason: String)

fun fnv1a32(s: String): Int {
    var h = 0x811c9dc5.toInt()
    for (b in s.toByteArray()) {
        h = h xor (b.toInt() and 0xff)
        h *= 0x01000193
    }
    return h
}

/** Negative, zero or positive, comparing dotted versions ("2.10.0" is newer than "2.9.3"). */
fun compareVersions(a: String, b: String): Int {
    // [ ] Compare dotted versions number by number
}

/** 0-99, the same for a courier and a flag on every launch, independent across flags. */
fun bucket(flagKey: String, courierId: String): Int {
    // [ ] A stable bucket per flag and courier
}

fun evaluate(flag: Flag, c: Courier): Decision {
    // [ ] Off for everyone once the flag is killed
    // [ ] Off on app versions and phones that cannot run it
    // [ ] QA couriers always get it
    val b = bucket(flag.key, c.id)
    return if (b < flag.percent) Decision(true, "rollout bucket $b") else Decision(false, "outside rollout bucket $b")
}

// ---------------------------------------------------------------- test runner (do not change)
// "flag key=<k> enabled=<bool> percent=<n> minVersion=<v> minSdk=<n> allow=<id,id|->" lines, then
// "courier <id> <appVersion> <sdk>" lines. Prints every flag's decision for every courier.
fun main() {
    val flags = mutableListOf<Flag>()
    val couriers = mutableListOf<Courier>()
    for (raw in generateSequence(::readLine)) {
        val p = raw.trim().split(" ")
        when (p[0]) {
            "flag" -> {
                val kv = p.drop(1).associate { it.substringBefore("=") to it.substringAfter("=") }
                val allow = kv.getValue("allow").let { if (it == "-") emptySet() else it.split(",").toSet() }
                flags += Flag(kv.getValue("key"), kv.getValue("enabled").toBoolean(), kv.getValue("percent").toInt(), kv.getValue("minVersion"), kv.getValue("minSdk").toInt(), allow)
            }
            "courier" -> couriers += Courier(p[1], p[2], p[3].toInt())
            "" -> {}
            else -> error("unknown line: $raw")
        }
    }
    for (c in couriers) for (f in flags) {
        val d = evaluate(f, c)
        println("${f.key} ${c.id} ${if (d.on) "ON" else "OFF"} ${d.reason}")
    }
}
