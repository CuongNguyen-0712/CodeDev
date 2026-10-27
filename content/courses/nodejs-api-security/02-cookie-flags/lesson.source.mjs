// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-1-2",
    title: "Cookie flags that matter: HttpOnly, Secure, SameSite & Path",
    slug: { _type: "slug", current: "cookie-flags-httponly-secure-samesite-path" },
    description:
        "CodeDev's refresh cookie was set with Domain=codedev.test, so every browser sent it to every subdomain, including learner preview apps that run learner-written server code and log request headers. Learn what each cookie attribute limits and what it does not (Domain the hosts, Path the request paths, Secure the scheme, HttpOnly the scripts, SameSite the sites), why a subdomain is the same site, how the __Host- and __Secure- prefixes lock a cookie down, why Max-Age and Expires must come from one clock, and how to clear a cookie so it is really gone.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer, CodeDev learning platform (NestJS API on https://api.codedev.test)",
        problem:
            "A learner reported through the security contact form that the request log of his own preview app, u-4821.preview.codedev.test, contained other learners' refresh tokens. Preview apps run learner-written server code so that learners can test their projects. Visitors who were signed in to CodeDev and opened his preview page sent their cd_rt cookie to his server. The cookie was HttpOnly, Secure and SameSite=Strict, and nobody had expected any of those to be a problem.",
    },

    content: [
        h2("1. The incident: a cookie sent to every subdomain"),
        p("The sign-in endpoint shipped with this helper. The comment explains the intent: the web app lives on app.codedev.test, the API on api.codedev.test, and someone wanted the cookie to \"work on both\":"),
        code("typescript", `
// auth/cookies.ts - the version that shipped
res.cookie("cd_rt", refreshToken, {
    domain: "codedev.test",        // "so it works on app. and api."
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
});`, "cookies.ts"),
        p("And this is what the learner found in his preview app's log, which prints every request header because he was debugging his own project:"),
        code("text", `
2026-10-20T19:42:07Z GET / host=u-4821.preview.codedev.test
  user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
  cookie: cd_at=eyJhbGciOiJIUzI1NiIs...; cd_rt=rt_8Kq2mX0pV7sLw3T...
2026-10-20T19:44:51Z GET / host=u-4821.preview.codedev.test
  cookie: cd_at=eyJhbGciOiJIUzI1NiIs...; cd_rt=rt_Hn4cJ9fQ1vB6yR2...`, "u-4821 request log"),
        p("Two learners' refresh tokens, each good for 30 days of fresh access tokens. Nothing was hacked: the browser did exactly what the cookie told it to do. `Domain=codedev.test` means \"send this to codedev.test and every host under it\", and the preview apps are hosts under it."),

        h2("2. Reproduce it and read the evidence"),
        p("Look at the header the API sends, not at the code that writes it. `curl -i` prints the response headers:"),
        code("bash", `
curl -si -X POST https://api.codedev.test/auth/sign-in \\
  -H "Content-Type: application/json" \\
  -d '{"email":"qa+cookies@codedev.test","password":"…"}' | grep -i '^set-cookie'

set-cookie: cd_at=eyJhbGciOi...; Max-Age=900; Domain=codedev.test; Path=/; Expires=Mon, 26 Oct 2026 09:15:00 GMT; HttpOnly; Secure; SameSite=Strict
set-cookie: cd_rt=rt_K7mQ2v...; Max-Age=2592000; Domain=codedev.test; Path=/; Expires=Wed, 25 Nov 2026 09:00:00 GMT; HttpOnly; Secure; SameSite=Strict`, "terminal"),
        p("Then confirm what the browser does with it. Sign in at https://app.codedev.test, open DevTools, **Application > Cookies**: the Domain column shows `.codedev.test` with a leading dot, which is how Chrome displays a domain cookie. Now open any preview page, for example https://u-4821.preview.codedev.test, and in the **Network** tab select the document request: under **Request Headers** the `Cookie` header carries `cd_rt`. The **Cookies** sub-tab of that request lists it as sent."),

        h2("3. What each attribute limits, and what it does not"),
        p("Each cookie attribute answers exactly one question. The incident happened because the team treated the attributes as a bundle of \"security flags\" instead of reading what each one limits. RFC 6265 defines the original set; `SameSite` and the name prefixes come from its revision, RFC 6265bis (draft-ietf-httpbis-rfc6265bis), which all current major browsers implement."),
        bullets([
            "**Domain: which hosts receive it.** Without a Domain attribute the cookie is *host-only*: it goes back only to the exact host that set it (RFC 6265, section 5.3, step 6). With `Domain=codedev.test` it goes to codedev.test and every subdomain, at any depth (section 5.1.3). There is no value that means \"api.codedev.test and app.codedev.test only\". If only the API reads the cookie, omit Domain.",
            "**Path: which request paths carry it.** `Path=/auth/refresh` keeps the refresh token off every other API request, so it does not end up in a logging middleware, an error report or a proxy log for `/me/progress`. It is not an isolation boundary: RFC 6265 says plainly that Path cannot be relied upon for security, because scripts on the same host can reach any path.",
            "**Secure: which schemes.** Only sent over HTTPS (section 4.1.2.5), so a network attacker cannot read it from a plain-HTTP request. Browsers following RFC 6265bis also refuse a `Secure` cookie set from a non-secure origin.",
            "**HttpOnly: who can read it in the page.** `document.cookie` and other script APIs do not see it (section 4.1.2.6). It does not hide the cookie from the network, from the server it is sent to, or from a script that simply makes a request and lets the browser attach it (lesson 3.3).",
            "**SameSite: which sites can trigger sending it.** `Strict`: never on requests started by another site, not even a link click. `Lax`: also on top-level `GET` navigations from another site. `None`: on all requests, and only allowed together with `Secure`. A *site* is the scheme plus the registrable domain, so `https://u-4821.preview.codedev.test` and `https://api.codedev.test` are the **same site**. SameSite does nothing against a sibling subdomain.",
        ]),
        p("Read the incident through that list: Domain sent the cookie to the preview host, the browser requested `/` on it (Path=/ matched), over HTTPS (Secure satisfied), from a page on the same site (Strict satisfied). HttpOnly only stopped scripts in the page; the learner's code ran on the server and read the header."),
        h3("Prefixes: rules the browser enforces for you"),
        p("A cookie name can carry a promise that the browser checks before storing it. A `Set-Cookie` that breaks the promise is dropped:"),
        bullets([
            "**`__Secure-`**: the cookie must have `Secure` and be set from an HTTPS origin.",
            "**`__Host-`**: must have `Secure`, `Path=/` and **no** Domain. The cookie is then locked to one host. A sibling subdomain (such as a preview app) cannot set a cookie with the same name for the parent domain to shadow it or fixate a session, because any `__Host-` cookie with a Domain attribute is rejected.",
        ]),
        p("The refresh cookie cannot use `__Host-`, because it needs `Path=/auth/refresh`. It uses `__Secure-` and no Domain, which keeps it host-only. The access cookie, sent to every API path, can use `__Host-`."),
        h3("Max-Age and Expires"),
        p("`Expires` is an absolute date, read with the browser's own clock; `Max-Age` is a number of seconds from when the cookie is received. When both are present, Max-Age wins (RFC 6265, section 5.3, step 3). Every current browser supports Max-Age; sending Expires as well costs nothing and helps old clients and intermediaries. Compute both from one injected clock so they cannot disagree, and so a test can check the exact date. A cookie with neither is a *session cookie* that lives until the browser decides the session is over, which with \"continue where you left off\" can be weeks."),
        callout("info", "When not to use Secure: one documented dev mode",
            "Chrome and Firefox treat http://localhost as a secure context and accept Secure cookies there, so local development usually needs no exception. Safari, and a phone testing a laptop at http://192.168.1.20:3000, do not. CodeDev has one named mode, local-http, that drops Secure and the prefixes; the API refuses to start with it when NODE_ENV is production. An ad hoc \"secure: false\" in a branch is how the flag goes missing in production."),

        challenge("chal_quiz_nas_121"),

        h2("4. The fix: host-only cookies built in one place"),
        p("The new design, as headers. Note what is gone: no Domain on either cookie."),
        code("text", `
Set-Cookie: __Host-cd_at=eyJhbGciOi...; Max-Age=900; Expires=Mon, 26 Oct 2026 09:15:00 GMT; Path=/; Secure; HttpOnly; SameSite=Lax
Set-Cookie: __Secure-cd_rt=rt_K7mQ2v...; Max-Age=2592000; Expires=Wed, 25 Nov 2026 09:00:00 GMT; Path=/auth/refresh; Secure; HttpOnly; SameSite=Strict`, "sign-in response"),
        bullets([
            "**Access cookie, `SameSite=Lax`.** The web app calls the API with `fetch(url, { credentials: \"include\" })`; that request is same-site, so Strict would work for it too. Lax is kept because certificate download links in emails open `GET https://api.codedev.test/me/certificates/…` as a top-level navigation from another site. Lax is the floor, never None.",
            "**Refresh cookie, always `SameSite=Strict`.** Only the app's own `POST /auth/refresh` needs it, and that is never started by another site.",
            "**Cross-origin, same-site.** app.codedev.test calling api.codedev.test is still cross-origin, so the API's CORS policy must allow the exact origin `https://app.codedev.test` with `Access-Control-Allow-Credentials: true`. CORS decides whether the page can read the response; it does not decide whether cookies are sent.",
        ]),
        p("All four header values (two at sign-in, two at logout) come from one function, so the rules live in one tested place, and the config is validated when the API starts:"),
        code("typescript", `
// auth/auth.controller.ts
@Post("sign-in")
async signIn(@Body() dto: SignInDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.signIn(dto);
    const cookies = buildAuthCookies(this.cookieConfig, this.clock.nowMs(), accessToken, refreshToken);
    if (!cookies.ok) throw new InternalServerErrorException(cookies.error);   // cannot happen after the startup check
    res.setHeader("Set-Cookie", cookies.login);     // an array sends one Set-Cookie header per value
}

@Post("logout")
@HttpCode(204)
async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeFamilyOf(req.cookies["__Secure-cd_rt"]);              // the server-side part (lesson 4.1)
    const cookies = buildAuthCookies(this.cookieConfig, this.clock.nowMs(), "x", "x");
    if (cookies.ok) res.setHeader("Set-Cookie", cookies.logout);
}

// main.ts - fail fast on a bad config
const check = buildAuthCookies(cookieConfig, Date.now(), "probe", "probe");
if (!check.ok) throw new Error(\`invalid cookie config: \${check.error}\`);
if (process.env.NODE_ENV === "production" && cookieConfig.environment === "local-http") {
    throw new Error("local-http cookies are not allowed in production");
}`, "auth.controller.ts"),
        h3("Clearing a cookie means naming the same cookie"),
        p("A browser identifies a stored cookie by name, domain and path. A `Set-Cookie` replaces a stored cookie only when all three match (RFC 6265, section 5.3, step 11). So a clearing cookie must repeat the Path and the Domain (or the absence of Domain) of the original. Express's `res.clearCookie(name)` defaults to `Path=/`, so called without a path it does not touch a refresh cookie set on `/auth/refresh`. Building the clearing values in the same function as the originals makes that mistake impossible."),
        p("Now write that function. The starter lists the exact validation rules, their order and the attribute order of each header; the tests run it against production, the local-http mode, invalid configs and a fake clock."),
        challenge("chal_coding_nas_122"),

        h2("5. How to verify"),
        bullets([
            "**`curl -si` on sign-in and logout.** No `Domain=` on either cookie; `Path=/auth/refresh` on the refresh cookie and on its clearing cookie; `Secure` on all four values outside local-http.",
            "**DevTools, Application > Cookies.** The Domain column shows `api.codedev.test` with no leading dot. After logout both rows are gone. A cookie the browser refused (for example a `__Host-` cookie with a Domain) shows a warning icon in the Network tab's Cookies sub-tab of the response, with the reason.",
            "**A preview page.** Open any `*.preview.codedev.test` page while signed in: its requests carry no `cd_` cookies in the Request Headers.",
            "**The console.** `document.cookie` on app.codedev.test shows none of the auth cookies, because they are HttpOnly and host-only to the API.",
            "**Unit tests on the exact strings.** As in the exercise: one config per environment, every invalid config, a fixed fake clock so Expires is a known date.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**Setting Domain \"so it works on both hosts\".** If only the API reads the cookie, the app host never needs it. Spot it by a leading dot in the Domain column, or `Domain=` in `curl -si` output.",
            "**Treating SameSite as subdomain isolation.** Subdomains of one registrable domain are the same site. Spot it in any design review that answers \"what about user content on a subdomain?\" with \"we use Strict\". Host untrusted content on a separate registrable domain, such as codedev-preview.test, instead.",
            "**Clearing with a different Path or Domain.** Logout returns 204, but the cookie is still there. Spot it by comparing the sign-in and logout `Set-Cookie` lines attribute by attribute.",
            "**`SameSite=None` to fix a CORS error.** CORS errors are about reading responses, not about sending cookies, and None removes cross-site protection. Spot it by a `SameSite=None` on a cookie that only same-site pages use.",
            "**A prefix rule broken in production.** `__Host-cd_at` with a Domain is silently dropped by the browser: sign-in returns 200, the next request is 401, the app loops back to sign-in. Spot it in the Network tab warning, or validate the config at startup as above.",
        ]),

        h2("7. Summary"),
        numbered([
            "Each attribute limits one thing: Domain the hosts, Path the paths, Secure the scheme, HttpOnly the scripts, SameSite the sites. None of them stops a cookie that Domain sends to a host you do not control.",
            "Make auth cookies host-only: `__Host-` for the access cookie on `Path=/`, `__Secure-` with `Path=/auth/refresh` and `SameSite=Strict` for the refresh cookie, Secure everywhere except one documented local-http mode.",
            "Build sign-in and clearing cookies in one function from one clock, so Max-Age and Expires agree and logout names exactly the cookie that sign-in set.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 6265, HTTP State Management Mechanism: 4.1.2 (cookie attributes), 5.1.3 (domain matching), 5.3 (storage model) and 8 (security considerations) - datatracker.ietf.org/doc/html/rfc6265",
            "RFC 6265bis (draft-ietf-httpbis-rfc6265bis): the SameSite attribute and the __Secure- and __Host- cookie name prefixes",
            "OWASP Session Management Cheat Sheet: Cookies (Secure, HttpOnly, SameSite, Domain and Path attributes) - cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run curl -si against the sign-in and logout endpoints of an app you own and put each Set-Cookie line in a table: Domain, Path, Secure, HttpOnly, SameSite, Max-Age and Expires. For each cookie, list every host and path that will receive it. If a host on that list runs code you do not control, fix the cookie before anything else."),
    ],
});
