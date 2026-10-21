// Wrong variant: the incident code - spreads the whole source into an array before filtering.
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
  return [...users].filter(isMatch).slice(0, n);
}
