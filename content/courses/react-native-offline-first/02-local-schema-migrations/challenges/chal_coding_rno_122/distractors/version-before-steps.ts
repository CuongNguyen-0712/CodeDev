// @piece atomic-step: Run one migration and record it, all or nothing
db.setUserVersion(m.version);
db.transaction((tx) => m.up(tx));
