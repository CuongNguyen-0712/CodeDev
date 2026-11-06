// @piece wait-turn: Skip entries that are not due or wait behind an earlier one
if (entry.nextAttemptAt > now) {
    continue;
}
