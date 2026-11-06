// @piece budget: The input budget; the newest message must fit
const budget = contextLimit;
let total = system.tokens + newest.tokens;
if (total > budget) return { error: "does_not_fit" };
