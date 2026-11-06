// @piece start-mutation: Accept only the next step of what the courier sees
val current = server[orderId] ?: return null
if (to.ordinal != current.ordinal + 1) return null
val change = Pending(mutationId, orderId, to)
pending += change
return change
