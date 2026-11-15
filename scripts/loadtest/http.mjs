// Set-Cookie lines -> name/value jar. Later lines win; an empty value or Max-Age=0 clears the cookie.
export function parseSetCookies(setCookie) {
    const jar = {};
    for (const line of setCookie) {
        const [pair, ...attrs] = line.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        const expired = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a));
        if (!value || expired) delete jar[name];
        else jar[name] = value;
    }
    return jar;
}

export const cookieHeader = (jar) =>
    Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");

/** The cookies a minted session keeps: next-auth session (maybe chunked) and cd_refresh, under plain or __Secure-/__Host- names; csrf dropped. Null when either is missing. */
export function sessionCookies(jar) {
    const out = Object.fromEntries(Object.entries(jar).filter(([k]) => !k.endsWith("next-auth.csrf-token")));
    const keys = Object.keys(out);
    return keys.some((k) => k.includes("next-auth.session-token")) && keys.some((k) => k.endsWith("cd_refresh")) ? out : null;
}
