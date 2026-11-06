// @piece latest-per-id: Keep only the latest report of each metric instance
const latest = new Map();
for (const beacon of beacons) if (!latest.has(beacon.id)) latest.set(beacon.id, beacon);
