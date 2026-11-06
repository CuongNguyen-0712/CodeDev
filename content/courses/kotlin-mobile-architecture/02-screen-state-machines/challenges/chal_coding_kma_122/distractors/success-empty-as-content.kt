// @piece success: An answer with orders, or with none
is Event.Success -> Screen.Content(event.items, refreshing = false, notice = null, gen = event.gen)
