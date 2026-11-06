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
    // [ ] Top position of every row, and the total height
    // [ ] First row whose bottom is below the scroll position
    // [ ] First row that starts at or below the viewport's bottom edge
    // [ ] Extra rows above and below, kept inside the list
    // [ ] Keys that follow the row, not its position
    return { start, end, offsetTop: tops[start], totalHeight: tops[rows.length], keys };
}
