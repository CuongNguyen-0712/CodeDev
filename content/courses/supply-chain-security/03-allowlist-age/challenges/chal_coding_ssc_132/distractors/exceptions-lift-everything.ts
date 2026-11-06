// @piece exceptions: Apply a matching exception
const matching = policy.exceptions.filter((e) => e.name === change.name && e.version === change.to);
const valid = matching.find((e) => isDate(e.expires) && today <= e.expires);
if (valid) return { allow: true, reasons: [`exception ${valid.ticket} (expires ${valid.expires})`] };
if (!valid && matching.length > 0) reasons.push(`exception ${matching[0].ticket} not valid (expires ${matching[0].expires})`);
return { allow: false, reasons };
