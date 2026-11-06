// @piece on-refresh: Pull to refresh: keep the list on screen
is Action.Refresh -> state.copy(orders = emptyList(), refreshing = true, error = null)
