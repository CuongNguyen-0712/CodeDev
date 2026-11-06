// @piece plan: plan
const planText = requiredString("plan");
let plan: Plan | undefined;
if (planText !== undefined) {
    plan = PLANS.find((p) => p === planText.trim().toLowerCase());
    if (plan === undefined) errors.push({ field: "plan", message: "plan must be one of: free, premium" });
}
