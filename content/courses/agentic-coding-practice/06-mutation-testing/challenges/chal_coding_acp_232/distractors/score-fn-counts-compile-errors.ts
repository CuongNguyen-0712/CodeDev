// @piece score-fn: Helper: the score of a list of mutants
function score(mutants: Mutant[]): Score {
    const detected = mutants.filter((m) => DETECTED.has(m.status)).length;
    const valid = mutants.filter((m) => m.status !== "ignored").length;
    return { detected, valid, score: valid === 0 ? null : Math.round((detected * 1000) / valid) / 10 };
}
