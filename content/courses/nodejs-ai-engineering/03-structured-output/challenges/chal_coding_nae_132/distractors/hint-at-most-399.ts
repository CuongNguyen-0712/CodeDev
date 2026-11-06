// @piece hint: Check hint
const hint = data.hint;
if (!has("hint")) errors.push("$.hint: required");
else if (typeof hint !== "string") errors.push("$.hint: expected a string");
else if (hint.trim() === "") errors.push("$.hint: must not be blank");
else if (hint.length >= 400) errors.push("$.hint: longer than 400 characters");
