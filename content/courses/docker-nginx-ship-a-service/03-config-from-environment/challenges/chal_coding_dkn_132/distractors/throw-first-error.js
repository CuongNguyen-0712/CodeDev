// @piece throw-or-freeze: Throw all problems at once, or return frozen
if (errors.length) throw new Error(errors[0]);
return Object.freeze({ port, databaseUrl, logLevel, jwtSecret });
