// @piece refresh: Start over from the newest orders
fun refresh() {
    generation++
    nextKey = null
    request(null)
}
