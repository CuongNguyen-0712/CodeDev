// @piece totals: The total and the monthly projection
lines.push(`total count=${count} errors=${errors} cost=${total.toFixed(6)}`);
const monthlyRequests = input.requestsPerDay * input.daysPerMonth;
const monthly = count === 0 ? 0 : total * monthlyRequests;
lines.push(`monthly requests=${monthlyRequests} cost=${monthly.toFixed(2)}`);
