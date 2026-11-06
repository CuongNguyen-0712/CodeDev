// @piece on-loaded: Fresh orders arrived
is Action.Loaded -> state.copy(orders = action.orders, loading = false, refreshing = false)
