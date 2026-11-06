// @piece stale-revalidate: Stale: answer now, revalidate in the background
if (entry && age < this.maxAge + this.staleWhileRevalidate) {
    this.startFetch(key).catch(() => {}); // a failed background revalidation must not crash anything
    return { status: "STALE", value: entry.value, error: null, fetchesStarted: 1 };
}
