// @piece start-errors: Start the error list
const ALLOWED: Record<string, boolean> = { displayName: true, bio: true, avatarUrl: true };
// Whitelist: every own property that is not a DTO field is an error (forbidNonWhitelisted).
const errors = Object.keys(input)
    .filter((key) => !(key in ALLOWED))
    .map((key) => `property ${key} should not exist`);
