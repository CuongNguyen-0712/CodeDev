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
