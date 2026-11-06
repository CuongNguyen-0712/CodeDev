// @piece distance-cell: One table cell: edit, substitute or swap
const cost = a[i - 1] === b[j - 1] ? 0 : 1;
let best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);

d[i].push(best);
