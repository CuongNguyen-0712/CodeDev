// @piece combine: One verdict for the whole line
const verdicts = [judgeSegment(segments[0], policy)];
return verdicts.find((v) => v.decision === "deny")
    ?? verdicts.find((v) => v.decision === "ask")
    ?? { decision: "allow", rule: "allow-list" };
