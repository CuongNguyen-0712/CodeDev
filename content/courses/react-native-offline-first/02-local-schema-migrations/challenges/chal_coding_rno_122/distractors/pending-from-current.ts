// @piece pending-steps: The migrations this database has not run yet
const pending = MIGRATIONS
    .filter((m) => m.version >= current && m.version <= appVersion)
    .sort((a, b) => a.version - b.version);
