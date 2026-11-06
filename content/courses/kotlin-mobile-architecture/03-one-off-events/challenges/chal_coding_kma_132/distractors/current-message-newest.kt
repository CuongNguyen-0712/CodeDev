// @piece current-message: The message the screen shows now
fun currentMessage(state: CourierState): UserMessage? = state.messages.lastOrNull()
