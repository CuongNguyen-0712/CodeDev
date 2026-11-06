// @piece decision: Pick the decision and build the report
const groups = [overall, ...slices];
const decision = groups.some((g) => g.status === "regressed")
    ? "fail"
    : "pass";
return { decision, paired: pairs.length, unpaired: base.size + cand.size - 2 * pairs.length, overall, slices, reasons };
