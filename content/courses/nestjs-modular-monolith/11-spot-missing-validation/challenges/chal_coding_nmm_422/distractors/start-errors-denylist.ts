// @piece start-errors: Start the error list
const FORBIDDEN_FIELDS = ["isAdmin", "role", "exp"];
// Whitelist: every own property that is not a DTO field is an error (forbidNonWhitelisted).
const errors = Object.keys(input)
    .filter((key) => FORBIDDEN_FIELDS.includes(key))
    .map((key) => `property ${key} should not exist`);
