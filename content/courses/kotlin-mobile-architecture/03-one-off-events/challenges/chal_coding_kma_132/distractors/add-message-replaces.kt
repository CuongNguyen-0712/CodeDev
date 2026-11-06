// @piece add-message: Queue a message with its own id
fun withMessage(state: CourierState, text: String): CourierState =
    state.copy(messages = listOf(UserMessage(state.nextId, text)), nextId = state.nextId + 1)
