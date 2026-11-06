// @piece next-due: The earliest live task due by the target, first queued first
queue.removeAll { it.cancelled }
val next = queue.firstOrNull { it.at <= target } ?: break
