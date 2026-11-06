// @piece group-runs: Group usable runs by prompt and temperature
// one group per prompt and temperature: normalised output -> how many runs produced it
const groups = new Map<string, { prompt: string; temperature: number; counts: Map<string, number> }>();
let ignored = 0;
for (const run of runs) {
    if (!isValid(run)) {
        ignored++;
        continue;
    }
    const key = run.prompt;
    let group = groups.get(key);
    if (!group) {
        group = { prompt: run.prompt, temperature: run.temperature, counts: new Map() };
        groups.set(key, group);
    }
    const text = normalise(run.output as string);
    group.counts.set(text, (group.counts.get(text) ?? 0) + 1);
}
