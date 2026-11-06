// menu/virtualWindow.js: the food-court menu lists up to 3,000 rows (category headers and dishes).
// Rendering all of them built 45,000 DOM nodes; now the list renders only the rows in view plus a
// few extra above and below, inside one spacer as tall as the whole list.
//
// rows:     [{ id, height }] in display order (heights in px, headers and dishes differ)
// viewport: { scrollTop, height }        options: { overscan } (rows to add on each side, default 3)
// return:   { start, end, offsetTop, totalHeight, keys }
//           rows start..end-1 are rendered; the first one is placed at offsetTop;
//           keys are the React keys of the rendered rows, in order.
function visibleWindow(rows, viewport, options = {}) {
    const overscan = options.overscan ?? 3;
    // @piece prefix-tops: Top position of every row, and the total height
    const tops = new Array(rows.length + 1);
    tops[0] = 0;
    for (let i = 0; i < rows.length; i++) tops[i + 1] = tops[i] + rows[i].height;
    // @end
    // @piece first-visible: First row whose bottom is below the scroll position
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tops[mid + 1] <= viewport.scrollTop) lo = mid + 1;
        else hi = mid;
    }
    const first = lo;
    // @end
    // @piece past-last-visible: First row that starts at or below the viewport's bottom edge
    const bottom = viewport.scrollTop + viewport.height;
    let last = first;
    while (last < rows.length && tops[last] < bottom) last++;
    // @end
    // @piece add-overscan: Extra rows above and below, kept inside the list
    const start = Math.max(0, first - overscan);
    const end = Math.min(rows.length, last + overscan);
    // @end
    // @piece row-keys: Keys that follow the row, not its position
    const keys = rows.slice(start, end).map((row) => row.id);
    // @end
    return { start, end, offsetTop: tops[start], totalHeight: tops[rows.length], keys };
}
