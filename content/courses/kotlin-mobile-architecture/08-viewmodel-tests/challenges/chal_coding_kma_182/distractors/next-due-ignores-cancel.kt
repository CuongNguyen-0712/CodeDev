// @piece next-due: The earliest live task due by the target, first queued first
val next = queue.filter { it.at <= target }.minWithOrNull(compareBy<Task>({ it.at }, { it.seq })) ?: break
