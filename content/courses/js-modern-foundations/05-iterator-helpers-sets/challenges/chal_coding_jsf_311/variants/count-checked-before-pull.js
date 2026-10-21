// Wrong variant: checks "do I have enough?" only after pulling the next user, so it pulls one extra.
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
  const out = [];
  for (const user of users) {
    if (out.length >= n) break;
    if (isMatch(user)) out.push(user);
  }
  return out;
}
