function loadConfig(env, files) {
    const errors = [];
    const get = (name) => (env[name] === undefined || env[name] === "" ? undefined : env[name]);

    const rawPort = get("PORT");
    const port = rawPort === undefined ? 3000 : parseInt(rawPort, 10);
    if (rawPort !== undefined && (Number.isNaN(port) || port < 1 || port > 65535)) {
        errors.push(`PORT must be an integer from 1 to 65535, got "${rawPort}"`);
    }

    const databaseUrl = get("DATABASE_URL");
    if (databaseUrl === undefined) errors.push("DATABASE_URL is required");
    else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
        // Never echo the value: it carries the database password.
        errors.push("DATABASE_URL must start with postgres:// or postgresql://");
    }

    const logLevel = get("LOG_LEVEL") ?? "info";
    if (!["debug", "info", "warn", "error"].includes(logLevel)) {
        errors.push(`LOG_LEVEL must be one of debug, info, warn, error, got "${logLevel}"`);
    }

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

    if (errors.length) throw new Error(errors.sort().join("; "));
    return Object.freeze({ port, databaseUrl, logLevel, jwtSecret });
}
