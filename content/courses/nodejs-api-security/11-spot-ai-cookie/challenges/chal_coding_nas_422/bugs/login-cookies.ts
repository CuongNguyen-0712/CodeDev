// @piece login-cookies: The cookies sent back after login
// Domain on the parent domain, so app.codedev.test can read the cookies too.
const shared = "Domain=codedev.test; Path=/; Secure";
return {
    status: 200,
    setCookie: [
        `refresh_token=${tokens.refreshToken}; ${shared}; Max-Age=${REFRESH_TTL_S}`,
        `display_name=${encodeURIComponent(user.displayName)}; ${shared}; Max-Age=${REFRESH_TTL_S}`,
    ],
