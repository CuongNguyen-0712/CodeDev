// @piece past-last-visible: First row that starts at or below the viewport's bottom edge
const bottom = viewport.scrollTop + viewport.height;
let last = first;
while (last < rows.length && tops[last] <= bottom) last++;
