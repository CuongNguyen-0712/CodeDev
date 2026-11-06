// @piece on-failed: The request failed
is Action.LoadFailed -> state.copy(loading = false, error = action.message)
