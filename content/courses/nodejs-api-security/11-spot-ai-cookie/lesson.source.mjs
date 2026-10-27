// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-4-2",
    title: "Spot the AI mistake: a token cookie JavaScript can read",
    slug: { _type: "slug", current: "spot-the-ai-mistake-token-cookie-javascript-can-read" },
    description:
        "An AI assistant was asked to set the auth cookies after login so the frontend could show the user's name. It put the refresh token in a cookie any script can read, sent it to every subdomain, and returned the access token in the JSON body for localStorage. Everything worked, so it was merged. Learn to ask who needs each value, which flag answers which threat (HttpOnly, Secure, Domain, Path, SameSite, the __Host- and __Secure- prefixes), why an HttpOnly cookie limits XSS but does not stop it, and how to review AI-written auth code against a checklist and prove the fix with tests.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev auth service",
        problem:
            "A security researcher reports two findings against https://app.codedev.test. First, an HTML injection in course comments lets a script run on the app, and her proof of concept sends both of a victim's tokens to her server: the access token from localStorage and the refresh token from document.cookie. Second, the access logs of the community forum on https://forum.codedev.test, run by a third-party vendor, contain refresh tokens of signed-in learners in the Cookie header. Both trace back to one pull request: the login cookie helper, written with an AI coding assistant three weeks ago.",
    },

    content: [
        h2("1. The incident: a helper that did exactly what it was asked"),
        p("The ticket that started it asked for a small thing: the header of the app should greet the learner by name without an extra API call. The request sent to the assistant was one sentence: \"Set the auth cookies after login so the frontend can show the user's name.\" This is what it produced for `POST /auth/login`:"),
        code("typescript", `
// auth/login-response.ts - as merged
function buildLoginResponse(user: User, tokens: Tokens): LoginResponse {
  // Domain on the parent domain, so app.codedev.test can read the cookies too.
  const shared = "Domain=codedev.test; Path=/; Secure";
  return {
    status: 200,
    setCookie: [
      \`refresh_token=\${tokens.refreshToken}; \${shared}; Max-Age=\${REFRESH_TTL_S}\`,
      \`display_name=\${encodeURIComponent(user.displayName)}; \${shared}; Max-Age=\${REFRESH_TTL_S}\`,
    ],
    // The SPA keeps the access token and sends it as "Authorization: Bearer ...".
    body: { user: { id: user.id, displayName: user.displayName }, accessToken: tokens.accessToken, expiresIn: ACCESS_TTL_S },
  };
}

// web/src/auth/session.ts - changed in the same pull request
localStorage.setItem("access_token", body.accessToken);`, "as merged"),
        p("Read the request again. \"So the frontend can show the user's name\" is a requirement about **one** value, the display name. The assistant solved it for every value: one shared attribute string, a parent `Domain` so the app can read the cookies, no `HttpOnly` because a readable cookie is what the frontend needs, and the access token in the body because that is how most tutorials do it. The code is tidy, it has comments that explain it, and every manual check passed: login works, the header says \"Hi, Lan Nguyen\", refresh works."),

        h2("2. Reproduce it and read the evidence"),
        p("Sign in, open DevTools on https://app.codedev.test and go to **Application > Cookies**. The table has a column for each attribute; an empty HttpOnly column next to a token is the first red flag. Then ask the Console what any script on the page can see:"),
        code("text", `
> document.cookie
'refresh_token=rt_Q2xhc3NpY...; display_name=Lan%20Nguyen'
> localStorage.getItem("access_token")
'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1XzE3Ii...'`, "DevTools Console on app.codedev.test"),
        p("Both tokens, one line each. That is all the researcher's payload had to do. The server side tells the same story without a browser:"),
        code("bash", `
curl -si https://api.codedev.test/auth/login -H "Content-Type: application/json" \\
  -d '{"email":"lan@example.test","password":"..."}' | grep -i -e '^set-cookie' -e accessToken

set-cookie: refresh_token=rt_Q2xhc3NpY...; Domain=codedev.test; Path=/; Secure; Max-Age=1209600
set-cookie: display_name=Lan%20Nguyen; Domain=codedev.test; Path=/; Secure; Max-Age=1209600
{"user":{"id":"u_17","displayName":"Lan Nguyen"},"accessToken":"eyJhbGciOiJIUzI1NiJ9...","expiresIn":900}`, "terminal"),
        p("And the forum finding: `Domain=codedev.test` means \"send this cookie to codedev.test and every subdomain of it\". The browser did exactly that, so every page view on forum.codedev.test carried the refresh token to software CodeDev does not run, and into its access logs."),

        h2("3. Core idea: who needs each value?"),
        p("Before choosing flags, list every value the login response hands to the browser and ask who has to read it. Everything else follows from that answer:"),
        code("text", `
value            who needs to read it                 where it should live
access token     the API, on every request             HttpOnly cookie, host-only api.codedev.test, Path=/
refresh token    the API, only POST /auth/refresh      HttpOnly cookie, host-only api.codedev.test, Path=/auth/refresh
display name     the SPA on app.codedev.test           readable cookie, Domain=codedev.test (not sensitive)
tokens in body   nobody                                 nowhere`, "the review table"),
        p("Each cookie attribute answers one question, and none of them answers another's:"),
        bullets([
            "**HttpOnly: can scripts read it?** With HttpOnly, `document.cookie` does not show the cookie; the browser still sends it with requests. Every token gets it. A value the SPA must read, such as the display name, cannot have it, so it must not be sensitive.",
            "**Secure: only over HTTPS.** Without it, a single `http://` request on a hostile network exposes the cookie.",
            "**Domain: which hosts receive it?** Leave Domain out and the cookie is **host-only**: only the host that set it gets it back. Any Domain value widens it to that domain and all its subdomains. A token should almost never have one.",
            "**Path: which paths receive it?** `Path=/auth/refresh` keeps the refresh token off every other request, and so out of most access logs, proxies and error reports. Path is not a wall against a script on the same origin; HttpOnly is what keeps scripts out.",
            "**SameSite: is it sent on requests started by another site?** A site is the registrable domain, so app, api and forum on codedev.test are all the **same site**. SameSite is a CSRF defence (lesson 3.3); it does nothing about subdomains. Without the attribute, Chrome treats the cookie as Lax but other browsers may not, so always set it explicitly.",
            "**Name prefixes: let the browser enforce the rules.** A cookie named `__Secure-...` is only accepted with Secure. A cookie named `__Host-...` is only accepted with Secure, `Path=/` and no Domain, which also means a subdomain cannot plant or overwrite it. The refresh cookie needs a narrow Path, so it cannot use `__Host-`; `__Secure-` is the strongest prefix it can have.",
        ]),
        h3("Why not localStorage?"),
        p("localStorage is readable by every script on the origin, it survives closing the browser, and a token copied from it works from any machine until it expires. An HttpOnly cookie cannot be copied by a script at all. That is a real difference, but be precise about its size: a script running on the page can still **use** the cookie by sending requests from the page while it runs. HttpOnly turns \"the attacker owns the session for 14 days from anywhere\" into \"the attacker acts in the victim's open tab\". It does not replace escaping output and a Content Security Policy."),
        h3("When cookies are the wrong choice"),
        bullets([
            "**Native mobile apps and server-to-server clients** have no browser cookie jar. They keep the refresh token in the platform's secure storage (Keychain, Android Keystore) and send the access token as a Bearer header.",
            "**An API called from many unrelated sites.** Cookies follow the site; a public API used by third-party front ends uses Bearer tokens and OAuth instead.",
            "**Cookies bring CSRF with them.** A browser attaches cookies automatically, so state-changing endpoints need SameSite plus a CSRF defence (lesson 3.3). Moving tokens into cookies without that is trading one hole for another.",
        ]),

        challenge("chal_quiz_nas_421"),

        h2("4. Reviewing AI-written auth code"),
        p("The assistant's mistake is a common one: it optimised for the one requirement it was given and filled the rest with the most common pattern it has seen, and \"JWT in localStorage\" is in a great many tutorials. A happy-path test cannot catch it, because every insecure version works. Review generated auth code against a list, not against \"does it run\":"),
        numbered([
            "**List every value the response sets** (cookies, body fields, headers) and write next to each who needs to read it. Anything nobody needs is removed.",
            "**For each cookie, check every attribute against that list**: HttpOnly for anything sensitive, Secure always, no Domain unless another host must receive it, the narrowest Path that works, an explicit SameSite, a prefix the browser can enforce, and a Max-Age that matches the token's real lifetime.",
            "**Search for shared attribute strings and option objects.** One `shared` or `cookieOptions` constant reused for a token and a display value is exactly how a readable flag ends up on a token.",
            "**Search the front end for storage of tokens**: `git grep -n -e localStorage -e sessionStorage -- web/src` and read every hit that stores a value from an auth response.",
            "**Ask for the negative tests**: the response body contains no token, `document.cookie` contains no token, a request to another subdomain carries no token. Write them yourself if the assistant did not.",
        ]),

        h2("5. Worked example: the fix in NestJS"),
        p("In NestJS on Express, `res.cookie()` builds the Set-Cookie header. Two details catch people: Express's `maxAge` is in **milliseconds** (it writes `Max-Age` in seconds and an `Expires` date for you), and leaving `domain` out is how you get a host-only cookie. The access cookie and the display name look like this; the refresh cookie follows the same reasoning with the narrow Path from the review table, which you will write in the challenge:"),
        code("typescript", `
// auth/auth.controller.ts
@Post("login")
@HttpCode(200)
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const { user, tokens } = await this.auth.login(dto.email, dto.password);

  res.cookie("__Host-cd_at", tokens.accessToken, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 15 * 60 * 1000,                       // ms: Max-Age=900
  });                                              // no domain: host-only api.codedev.test

  // ...the refresh cookie: HttpOnly, Secure, SameSite=Strict, only for /auth/refresh

  res.cookie("display_name", user.displayName, {  // Express encodes the value
    secure: true, sameSite: "lax", path: "/", domain: "codedev.test",
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });

  return { user: { id: user.id, displayName: user.displayName } };   // no token in the body
}`, "auth.controller.ts"),
        p("The SPA stops touching tokens. It sends every API call with `credentials: \"include\"`, and the API answers its origin explicitly, because a credentialed request is refused when `Access-Control-Allow-Origin` is `*`:"),
        code("typescript", `
// web/src/api/client.ts
export const api = (path: string, init: RequestInit = {}) =>
  fetch(\`https://api.codedev.test\${path}\`, { ...init, credentials: "include" });

// main.ts (API)
app.enableCors({ origin: ["https://app.codedev.test"], credentials: true });`, "client.ts and main.ts"),
        p("The access guard now reads the token from the `__Host-cd_at` cookie instead of the Authorization header. During the rollout it can accept both for one access token lifetime (15 minutes), so tabs that signed in before the deploy keep working; then the header path is removed. Finally, the old cookies are cleared on the next login or refresh with `refresh_token=; Domain=codedev.test; Path=/; Max-Age=0`: a cookie is only deleted when name, Domain and Path all match the one that was set."),

        h2("6. Fix the assistant's helper"),
        p("The challenge contains the assistant's `buildLoginResponse`, the SPA from the same pull request, and a small browser that applies the cookie rules from section 3: Domain and default Path, host-only cookies, and the `__Host-` and `__Secure-` prefixes (it rejects a cookie that breaks them, as real browsers do). The public tests are the reviewer's quick check, and they pass on the assistant's code. The hidden tests look at what a script can read, what the forum receives, the attributes of every cookie, the login body, and they make sure the learner's name is still on screen."),
        challenge("chal_coding_nas_422"),

        h2("7. How to verify the fix"),
        bullets([
            "**DevTools, Application > Cookies.** HttpOnly ticked on both tokens; Domain shows `api.codedev.test` (no leading dot) for them and `.codedev.test` only for display_name; the refresh cookie's Path is `/auth/refresh`.",
            "**DevTools Console.** `document.cookie` shows only `display_name=...`; `localStorage.length` is 0 after login.",
            "**An API test that reads the raw headers.** With supertest, `res.headers[\"set-cookie\"]` is an array of strings: assert each token cookie contains `HttpOnly`, `Secure` and its SameSite value and does not contain `Domain=`, and assert `JSON.stringify(res.body)` contains neither token.",
            "**The Network tab on another subdomain.** Open forum.codedev.test after signing in: the request's Cookie header must not contain a token.",
            "**Logs.** Search a day of API and proxy logs for `refresh_token=`; after the fix it should appear only on `/auth/refresh` requests, and only if something logs cookies at all (lesson 4.3).",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**One attribute string for every cookie.** The display value's needs (readable, shared with the app) leak onto the tokens. Spot it: a shared constant or options object used by more than one `Set-Cookie`.",
            "**`Domain` set to the parent domain \"to make it work\".** Every subdomain, including ones run by vendors, receives the cookie. Spot it: `Domain=` on a token cookie; DevTools shows a leading dot.",
            "**Believing SameSite protects against subdomains.** All subdomains are the same site. Spot it: SameSite=Strict next to a parent Domain in a review comment that says \"it's safe now\".",
            "**`__Host-` on a cookie with a narrow Path.** The browser silently drops it and refresh fails. Spot it: a `__Host-` name next to `Path=/auth/...`, or a cookie missing in DevTools right after login.",
            "**Tokens in the body \"for convenience\".** If the body has a token, some code will store it. Spot it: `accessToken` in the JSON of a login response, or `localStorage.setItem` with a token in the front end.",
        ]),

        h2("9. Summary"),
        numbered([
            "Start from who needs each value: tokens are for the API only, so they live in HttpOnly, Secure, host-only cookies with an explicit SameSite and the narrowest Path; only non-sensitive values like a display name may be readable.",
            "Each flag answers one threat: HttpOnly (scripts), Secure (plain HTTP), Domain (which hosts), Path (which endpoints), SameSite (other sites), prefixes (let the browser enforce it). HttpOnly limits what XSS can steal; it does not stop XSS.",
            "AI-written auth code tends to work and still be wrong. Review it against a checklist and back the review with negative tests: no token in the body, in document.cookie, in localStorage, or on another subdomain.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 6265, HTTP State Management Mechanism: sections 4.1.2 (Domain, Path, Secure, HttpOnly) and 8 (security considerations) - datatracker.ietf.org/doc/html/rfc6265",
            "OWASP Session Management Cheat Sheet: cookies, Domain and Path, HttpOnly and SameSite - cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
            "MDN Web Docs: Set-Cookie, including the __Secure- and __Host- prefixes and SameSite",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last login or session change in a project you work on and fill in the review table from section 3 for every value it sets. Then write the three negative tests (body, document.cookie, another subdomain). Next time you ask an AI assistant for auth code, paste the table into the prompt and ask for those tests in the same answer."),
    ],
});
