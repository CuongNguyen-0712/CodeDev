// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-2-2",
    title: "Paging with cursors",
    slug: { _type: "slug", current: "kotlin-paging-with-cursors" },
    description:
        "The courier's delivery history used offset paging: new orders shifted the pages and showed deliveries twice, a fast fling loaded a page twice, and a late page landed on a refreshed list. Learn cursor paging the way Paging 3 does it - keys from the server, prefetch distance, one load at a time, generations across refresh - and build the pager.",
    estimatedTime: 17,

    scenario: {
        role: "Android developer on the Rice Rocket courier app",
        problem:
            "Couriers scroll their delivery history at the end of the month to check payouts against deliveries. Busy couriers have 600+ rows; during a shift new deliveries keep arriving at the top. Support tickets: 'the same delivery is listed twice' and 'my list jumped back after I refreshed'.",
    },

    content: [
        h2("Situation"),
        code("kotlin", `
suspend fun loadMore() {
    val page = api.history(offset = items.size, limit = 20)    // offset shifts when new orders arrive
    items += page
}

LaunchedEffect(listState) {
    snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index }
        .collect { last -> if (last != null && last >= items.size - 5) viewModel.loadMore() }   // no in-flight check
}`, "HistoryViewModel.kt"),
        bullets([
            "Three new deliveries arrive while the courier reads page 1; offset 20 now starts three rows earlier, so rows 18-20 appear twice.",
            "A fling crosses the threshold on several frames: `loadMore` runs three times for the same offset.",
            "A slow page 2 requested before a pull-to-refresh arrives afterwards and is appended under the fresh page 1.",
        ]),

        h2("The core you need"),
        bullets([
            "**Cursor, not offset.** The server returns each page with a `next` cursor (here, the last id seen; often an opaque token). The next request continues after that row, so rows inserted at the top do not shift later pages. `next == null` means the end.",
            "**Prefetch distance.** Load the next page when the last visible item is within N items of the end, so the list never hits an empty bottom on a normal scroll. Paging 3 calls it `prefetchDistance` in `PagingConfig`.",
            "**One load at a time.** While a request is in flight, further triggers do nothing; when the end is reached, nothing is requested.",
            "**Refresh is a new generation.** Refresh restarts from the newest page, resets the cursor and the end flag, and bumps a generation number. A page that belongs to an older generation is dropped when it arrives. Paging 3 does this by creating a new `PagingSource` per refresh and invalidating the old one.",
            "**Keep the old list until the refresh page arrives.** Replacing the list with a spinner makes the screen jump; replace it in one step when the first new page is there.",
        ]),

        h2("Apply it in the project"),
        p("With Paging 3 the same rules are a `PagingSource` plus configuration:"),
        code("kotlin", `
class HistorySource(private val api: HistoryApi) : PagingSource<Long, Delivery>() {
    override suspend fun load(params: LoadParams<Long>): LoadResult<Long, Delivery> = try {
        val page = api.history(after = params.key, limit = params.loadSize)   // key = cursor, null = newest
        LoadResult.Page(data = page.items, prevKey = null, nextKey = page.next)
    } catch (e: IOException) {
        LoadResult.Error(e)
    }

    override fun getRefreshKey(state: PagingState<Long, Delivery>): Long? = null   // refresh = start from the newest
}

val history: Flow<PagingData<Delivery>> = Pager(
    config = PagingConfig(pageSize = 20, prefetchDistance = 5, enablePlaceholders = false),
    pagingSourceFactory = { HistorySource(api) },
).flow.cachedIn(viewModelScope)`, "HistoryViewModel.kt"),
        code("kotlin", `
val rows = viewModel.history.collectAsLazyPagingItems()
LazyColumn {
    items(count = rows.itemCount, key = rows.itemKey { it.id }) { index ->
        rows[index]?.let { DeliveryRow(it) }
    }
}`, "HistoryScreen.kt"),
        callout("info", "Why the challenge builds it by hand",
            "The challenge's `Pager` is the part Paging 3 hides: the trigger, the in-flight guard, the cursor, the end flag and the generation check. Knowing them tells you what to look for when a paged list duplicates or skips rows."),

        h2("Verify"),
        code("kotlin", `
@Test fun pagesSurviveInsertsAtTheTop() = runTest {
    val api = FakeHistoryApi(ids = (1000 downTo 989).toList())
    val source = HistorySource(api)
    val first = source.load(PagingSource.LoadParams.Refresh(null, 5, false)) as PagingSource.LoadResult.Page
    api.insertNewest(3)
    val second = source.load(PagingSource.LoadParams.Append(first.nextKey!!, 5, false)) as PagingSource.LoadResult.Page
    assertEquals(emptySet<Long>(), first.data.map { it.id }.toSet() intersect second.data.map { it.id }.toSet())
}`, "HistorySourceTest.kt"),

        h2("Pitfalls"),
        bullets([
            "**Unstable sort keys.** A cursor on `created_at` alone skips or repeats rows created in the same second. The server must order by a unique key (`created_at`, `id`) and use both in the cursor.",
            "**Item keys by position.** `key = { index }` in `LazyColumn` reuses row state for the wrong delivery after an insert. Key rows by id.",
            "**Retrying failed pages by scrolling.** After `LoadResult.Error`, show a retry row that calls `retry()`; scrolling up and down should not be the only way to recover.",
        ]),

        p("Build the pager. The editor holds `Pager` with its blocks missing, each marked by a `// [ ]` line; some pieces repeat the old list's bugs on purpose. Click a piece to fill a line, or drag it onto one. Run scrolls, delivers server answers in order and adds new orders on the server, and prints the list after each step."),
        challenge("chal_coding_kma_152"),
    ],
});
