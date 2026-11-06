// @piece in-range: Is a locked version inside the range?
const v = full(version.split("-")[0]);
if (!v) return false;
if (range.lower) {
    const c = cmp(v, range.lower.v);
    if (c < 0 || (c === 0 && !range.lower.inclusive)) return false;
}
if (range.upper) {
    const c = cmp(v, range.upper.v);
    if (c > 0 || (c === 0 && !range.upper.inclusive)) return false;
}
return true;
