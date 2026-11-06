// @piece count-delivered: Delivered orders inside [start, end)
val done = source.deliveriesSince(start)
    .filter { it.status == "DELIVERED" && !it.deliveredAt.isBefore(start) && !it.deliveredAt.isAfter(end) }
