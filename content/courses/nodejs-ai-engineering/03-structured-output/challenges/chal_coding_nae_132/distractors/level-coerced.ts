// @piece level: Check level
const level = typeof data.level === "string" ? Number(data.level) : data.level; // "be lenient"
if (!has("level")) errors.push("$.level: required");
else if (level !== 1 && level !== 2 && level !== 3) errors.push("$.level: expected 1, 2 or 3");
