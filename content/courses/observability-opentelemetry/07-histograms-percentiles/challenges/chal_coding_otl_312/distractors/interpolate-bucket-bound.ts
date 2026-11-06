// @piece quantile-interpolate: Find the bucket and interpolate inside it
const rank = q * total;
const finite = sorted.slice(0, -1);
const i = finite.findIndex((b) => b.count >= rank);
if (i === -1) return finite[finite.length - 1].le;
const lower = i === 0 ? 0 : finite[i - 1].le;
const before = i === 0 ? 0 : finite[i - 1].count;
return finite[i].le;
