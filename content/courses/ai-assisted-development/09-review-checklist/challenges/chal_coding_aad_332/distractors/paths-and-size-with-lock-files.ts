// @piece paths-and-size: Paths outside the allowed list, and the PR size
const outside = pr.files.filter((f) => !isAllowed(f.path, pr.policy.allowedPaths)).map((f) => f.path);

const total = pr.files
    .reduce((sum, f) => sum + f.additions + f.deletions, 0);
const max = pr.policy.maxChangedLines;
