// @piece only-courier-changed: Only the courier changed it: keep the edit
if (same(remote[f], base[f])) {
    merged[f] = remote[f] ?? null;
    continue;
}
