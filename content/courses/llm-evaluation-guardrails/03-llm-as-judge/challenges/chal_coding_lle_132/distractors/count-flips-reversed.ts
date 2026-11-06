// @piece count-flips: Count flips, positions and longer-answer wins
for (const s of swaps) {
    if (!winners.includes(s.original as string) || !winners.includes(s.swapped as string) || (s.longer !== "A" && s.longer !== "B")) {
        skipped++;
        continue;
    }
    pairs++;
    if (s.original !== s.swapped) {
        flips++;
        if (s.original === "A" && s.swapped === "B") second++;
        if (s.original === "B" && s.swapped === "A") first++;
    } else if (s.original === s.longer) {
        longerWins++;
    }
}
