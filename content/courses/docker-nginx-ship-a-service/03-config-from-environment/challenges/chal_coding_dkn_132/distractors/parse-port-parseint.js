// @piece parse-port: PORT: digits only, 1-65535, default 3000
const rawPort = get("PORT");
const port = rawPort === undefined ? 3000 : parseInt(rawPort, 10);
if (rawPort !== undefined && (Number.isNaN(port) || port < 1 || port > 65535)) {
    errors.push(`PORT must be an integer from 1 to 65535, got "${rawPort}"`);
}
