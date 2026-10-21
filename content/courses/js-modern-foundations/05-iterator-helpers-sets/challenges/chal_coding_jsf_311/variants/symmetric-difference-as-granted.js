// Wrong variant: uses symmetricDifference for "granted", which also contains every revoked permission.
function diffPermissions(before, after) {
  const was = new Set(before);
  const now = new Set(after);
  return {
    granted: [...was.symmetricDifference(now)],
    revoked: [...was.difference(now)],
    unchanged: [...was.intersection(now)],
  };
}

function firstMatching(users, isMatch, n) {
  return Iterator.from(users).filter(isMatch).take(n).toArray();
}
