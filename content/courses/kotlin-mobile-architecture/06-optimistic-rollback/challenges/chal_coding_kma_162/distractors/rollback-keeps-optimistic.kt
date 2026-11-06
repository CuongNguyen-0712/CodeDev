// @piece rollback: Drop the failed change and the ones queued after it
val failed = pending.firstOrNull { it.id == mutationId } ?: return null
pending.remove(failed)
server[failed.orderId] = failed.to
return "Could not mark ${failed.orderId} ${failed.to}: $reason"
