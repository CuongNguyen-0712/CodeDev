// Cho Xanh - the cart store behind the cart screen, with undo.
//
// The screen redraws only when the cart it gets from `current` is different (!=) from the
// last cart it drew. Since release 4.16 the screen stops redrawing after the first item,
// and "Undo" empties the whole cart instead of going back one step.
//
// Fix CartStore so that:
//   - every add or remove that changes the cart makes the screen redraw with the new cart,
//   - undo goes back exactly one change (several undos go back several changes),
//   - what the store hands out (current) can never change afterwards, whatever the store does.
// Removing an item that is not in the cart changes nothing and is not an undo step.
// Undo with no history does nothing.
//
// Input (stdin), one command per line: add ITEM... | remove ITEM... | undo
// Output (the test runner prints it): "render: [..]" after every command that changed what
// the screen shows, then "final: [..]" and "undo steps left: N".

class CartStore {
    private val items = mutableListOf<String>()
    private val history = mutableListOf<List<String>>()

    val current: List<String>
        get() = items

    val undoSteps: Int
        get() = history.size

    fun add(item: String) {
        history += items
        items += item
    }

    fun remove(item: String) {
        if (item !in items) return
        history += items
        items -= item
    }

    fun undo() {
        if (history.isEmpty()) return
        val previous = history.removeAt(history.lastIndex)
        items.clear()
        items += previous
    }
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    val store = CartStore()
    var lastRendered: List<String> = emptyList()
    for (line in generateSequence(::readLine)) {
        val command = line.substringBefore(" ")
        val item = line.substringAfter(" ", "")
        when (command) {
            "add" -> store.add(item)
            "remove" -> store.remove(item)
            "undo" -> store.undo()
            else -> continue
        }
        val state = store.current
        if (state != lastRendered) {
            println("render: $state")
            lastRendered = state
        }
    }
    println("final: ${store.current}")
    println("undo steps left: ${store.undoSteps}")
}
