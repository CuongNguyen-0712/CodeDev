// @piece fetch-and-store: Fetch; keep the answer only when it arrived
fun fetchAndStore(key: String, now: Int): String? {
    val value = fetch(key)
    val old = cache[key]
    if (value != null) cache[key] = Entry(value, now)
    else if (old != null) cache[key] = old.copy(fetchedAt = now)
    return value
}
