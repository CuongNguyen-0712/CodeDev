// @piece message-shown: The courier dismissed one message
fun messageShown(state: CourierState, id: Long): CourierState =
    state.copy(messages = state.messages.drop(1))
