// @piece hunk-lines: Inside the hunks: count added and removed lines
if (line.startsWith("+") && !line.startsWith("+++")) current.added++;
else if (line.startsWith("-") && !line.startsWith("---")) current.removed++;
continue;
