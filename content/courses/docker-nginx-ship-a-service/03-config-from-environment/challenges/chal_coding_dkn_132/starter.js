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
    // [ ] Collect errors; treat "" as not set

    // [ ] PORT: digits only, 1-65535, default 3000

    // [ ] DATABASE_URL: required, postgres scheme

    // [ ] LOG_LEVEL: one of four, default info

    // [ ] JWT secret from env or from a mounted file

    // [ ] Throw all problems at once, or return frozen
}
