// @piece header-builder: Build one Set-Cookie value
const header = (name: string, value: string, maxAge: number, expires: string, path: string, sameSite: string) =>
    [
        `${name}=${value}`,
        `Max-Age=${maxAge}`,
        `Expires=${expires}`,
        ...(config.domain !== null ? [`Domain=${config.domain}`] : []),
        `Path=${path}`,
        ...(secure ? ["Secure"] : []),
        "HttpOnly",
        `SameSite=${sameSite}`,
    ].join("; ");
const at = (ttl: number) => new Date(nowMs + ttl).toUTCString();
