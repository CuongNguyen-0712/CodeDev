import { readFileSync } from "node:fs";

// CodeDev "Explain my error": learners clicked "Explain again" and got a different answer each time.
// The team recorded several runs of the same prompts at different temperatures (no live model here:
// the outputs are a fixture) and wants one number per prompt and temperature: how repeatable is it?
//
// measureStability(runs, threshold):
//   1. A run is valid when prompt is a non-empty string, temperature is a finite number and output is
//      a string. Ignore every other run (a failed request is recorded with output null) and count the
//      ignored runs in "ignored".
//   2. Normalise each output before comparing: trim it, replace every run of whitespace (spaces, tabs,
//      newlines) with one space, and lower-case it. "Use  a NUMBER.\n" and "use a number." are equal.
//   3. Group the valid runs by prompt and temperature together. For each group:
//        runs       number of valid runs in the group
//        distinct   number of different normalised outputs
//        agreement  share of runs whose normalised output equals the most common one, i.e.
//                   (count of the most common output) / runs, rounded to 2 decimals with
//                   Math.round(share * 100) / 100
//        flagged    true when the unrounded share is below threshold (a share equal to it is not flagged)
//   4. Return { results, ignored } with results sorted by prompt (compare with < and >), then by
//      temperature from low to high. A prompt and temperature with no valid run has no row.
//
// Do not change the types or the test runner.

type RecordedRun = { prompt: string; temperature: number; output: string | null };

type StabilityRow = {
    prompt: string;
    temperature: number;
    runs: number;
    distinct: number;
    agreement: number;
    flagged: boolean;
};

type StabilityReport = { results: StabilityRow[]; ignored: number };

function normalise(output: string): string {
    return output.trim().replace(/\s+/g, " ").toLowerCase();
}

function isValid(run: RecordedRun): boolean {
    return (
        typeof run.prompt === "string" &&
        run.prompt !== "" &&
        typeof run.temperature === "number" &&
        Number.isFinite(run.temperature) &&
        typeof run.output === "string"
    );
}

function measureStability(runs: RecordedRun[], threshold: number): StabilityReport {
    // one group per prompt and temperature: normalised output -> how many runs produced it
    const groups = new Map<string, { prompt: string; temperature: number; counts: Map<string, number> }>();
    let ignored = 0;
    for (const run of runs) {
        if (!isValid(run)) {
            ignored++;
            continue;
        }
        const key = JSON.stringify([run.prompt, run.temperature]);
        let group = groups.get(key);
        if (!group) {
            group = { prompt: run.prompt, temperature: run.temperature, counts: new Map() };
            groups.set(key, group);
        }
        const text = normalise(run.output as string);
        group.counts.set(text, (group.counts.get(text) ?? 0) + 1);
    }

    const results: StabilityRow[] = [];
    for (const { prompt, temperature, counts } of groups.values()) {
        let total = 0;
        let top = 0;
        for (const n of counts.values()) {
            total += n;
            top = Math.max(top, n);
        }
        const share = top / total;
        results.push({
            prompt,
            temperature,
            runs: total,
            distinct: counts.size,
            agreement: Math.round(share * 100) / 100,
            flagged: share < threshold,
        });
    }
    results.sort((a, b) =>
        a.prompt < b.prompt ? -1 : a.prompt > b.prompt ? 1 : a.temperature - b.temperature,
    );
    return { results, ignored };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { threshold, runs } as JSON. Output: the StabilityReport, as JSON.
const input: { threshold: number; runs: RecordedRun[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(measureStability(input.runs, input.threshold)));
