// Rice Rocket api: read the whole configuration once, at startup, from the environment.
//
// env   - an object like process.env: every value is a string or undefined.
//         A variable set to "" counts as not set.
// files - an object { path: content } standing in for the files mounted in the container
//         (Docker secrets appear under /run/secrets/<name>).
//
// Rules (exact messages in the challenge description):
//   PORT          decimal digits only, 1-65535; default 3000
//   DATABASE_URL  required; must start with postgres:// or postgresql://
//   LOG_LEVEL     debug | info | warn | error; default info
//   JWT_SECRET    from JWT_SECRET, or from the file named by JWT_SECRET_FILE
//                 (trailing line break removed); exactly one of the two
//
// Collect ALL problems. If there is at least one, throw ONE Error whose message is the
// problems sorted alphabetically and joined with "; ". Otherwise return a frozen
// { port, databaseUrl, logLevel, jwtSecret } (port is a number).
function loadConfig(env, files) {
    // @piece collect-errors: Collect errors; treat "" as not set
    const errors = [];
    const get = (name) => (env[name] === undefined || env[name] === "" ? undefined : env[name]);
    // @end

    // @piece parse-port: PORT: digits only, 1-65535, default 3000
    const rawPort = get("PORT");
    const port = rawPort === undefined ? 3000 : Number(rawPort);
    if (rawPort !== undefined && !(/^\d+$/.test(rawPort) && port >= 1 && port <= 65535)) {
        errors.push(`PORT must be an integer from 1 to 65535, got "${rawPort}"`);
    }
    // @end

    // @piece database-url: DATABASE_URL: required, postgres scheme
    const databaseUrl = get("DATABASE_URL");
    if (databaseUrl === undefined) errors.push("DATABASE_URL is required");
    else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
        // Never echo the value: it carries the database password.
        errors.push("DATABASE_URL must start with postgres:// or postgresql://");
    }
    // @end

    // @piece log-level: LOG_LEVEL: one of four, default info
    const logLevel = get("LOG_LEVEL") ?? "info";
    if (!["debug", "info", "warn", "error"].includes(logLevel)) {
        errors.push(`LOG_LEVEL must be one of debug, info, warn, error, got "${logLevel}"`);
    }
    // @end

    // @piece jwt-secret: JWT secret from env or from a mounted file
    const secretFile = get("JWT_SECRET_FILE");
    let jwtSecret = get("JWT_SECRET");
    if (jwtSecret !== undefined && secretFile !== undefined) {
        errors.push("JWT_SECRET and JWT_SECRET_FILE are both set");
    } else if (secretFile !== undefined) {
        if (!Object.hasOwn(files, secretFile)) errors.push(`JWT_SECRET_FILE not found: ${secretFile}`);
        else {
            jwtSecret = files[secretFile].replace(/\r?\n$/, "");
            if (jwtSecret === "") errors.push("JWT_SECRET or JWT_SECRET_FILE is required");
        }
    } else if (jwtSecret === undefined) {
        errors.push("JWT_SECRET or JWT_SECRET_FILE is required");
    }
    // @end

    // @piece throw-or-freeze: Throw all problems at once, or return frozen
    if (errors.length) throw new Error(errors.sort().join("; "));
    return Object.freeze({ port, databaseUrl, logLevel, jwtSecret });
    // @end
}
