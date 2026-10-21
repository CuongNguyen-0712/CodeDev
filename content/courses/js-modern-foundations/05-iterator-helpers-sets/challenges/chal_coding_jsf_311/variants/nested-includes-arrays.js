// Wrong variant: the old O(n*m) array version - duplicates in the input end up in the audit twice.
function diffPermissions(before, after) {
  return {
    granted: after.filter((p) => !before.includes(p)),
    revoked: before.filter((p) => !after.includes(p)),
    unchanged: before.filter((p) => after.includes(p)),
  };
}

function firstMatching(users, isMatch, n) {
  return Iterator.from(users).filter(isMatch).take(n).toArray();
}
