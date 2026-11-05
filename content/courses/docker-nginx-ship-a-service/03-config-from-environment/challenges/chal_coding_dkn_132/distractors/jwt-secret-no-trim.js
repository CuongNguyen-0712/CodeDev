// @piece jwt-secret: JWT secret from env or from a mounted file
const secretFile = get("JWT_SECRET_FILE");
let jwtSecret = get("JWT_SECRET");
if (jwtSecret !== undefined && secretFile !== undefined) {
    errors.push("JWT_SECRET and JWT_SECRET_FILE are both set");
} else if (secretFile !== undefined) {
    if (!Object.hasOwn(files, secretFile)) errors.push(`JWT_SECRET_FILE not found: ${secretFile}`);
    else jwtSecret = files[secretFile];
} else if (jwtSecret === undefined) {
    errors.push("JWT_SECRET or JWT_SECRET_FILE is required");
}
