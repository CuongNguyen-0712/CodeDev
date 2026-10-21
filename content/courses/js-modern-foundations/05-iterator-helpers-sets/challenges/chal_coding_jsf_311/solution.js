/**
 * Reference solution (never shipped to learners).
 */
function diffPermissions(before, after) {
  const was = new Set(before);
  const now = new Set(after);
  return {
    granted: [...now.difference(was)],
    revoked: [...was.difference(now)],
    unchanged: [...was.intersection(now)],
  };
}

function firstMatching(users, isMatch, n) {
  // take(n) closes the source as soon as it has n values, without pulling one more.
  return Iterator.from(users).filter(isMatch).take(n).toArray();
}
