// @piece fresh-check: Is a cached entry still fresh?
fun isFresh(entry: Entry, now: Int): Boolean = entry.value.isNotEmpty()
