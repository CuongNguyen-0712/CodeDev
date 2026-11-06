// @piece both-changed: Both changed it: apply the field's policy
const localNewer = String(local.updatedAt) > String(remote.updatedAt);
merged[f] = (localNewer ? local[f] : remote[f]) ?? null;
