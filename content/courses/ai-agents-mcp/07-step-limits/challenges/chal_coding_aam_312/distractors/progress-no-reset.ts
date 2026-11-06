// @piece progress: Count tool results that bring nothing new
if (seen.has(result)) {
    noProgress++;
    if (noProgress >= limits.maxNoProgress) return stop("no_progress");
} else {
    seen.add(result);
    partial.push(result);
}
