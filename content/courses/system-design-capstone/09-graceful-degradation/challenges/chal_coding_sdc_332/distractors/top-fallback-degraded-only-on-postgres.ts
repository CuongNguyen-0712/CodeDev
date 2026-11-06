// @piece top-fallback: Read the leaderboard, falling back to Postgres
const r = this.call("leaderboard", now, () => this.deps.leaderboard.top(n, now));
if (r.ok && r.out !== null) {
    return { source: "redis", rows: r.out.rows, degraded: false, latencyMs: r.ms };
}
const pg = this.deps.store.top(n);
return { source: "postgres", rows: pg.rows, degraded: true, latencyMs: r.ms + pg.latencyMs };
