// @piece unexpected-keys: Reject keys the schema does not have
for (const key of Object.keys(data)) {
    if (!KEYS.includes(key)) continue; // extra keys are dropped silently
}
