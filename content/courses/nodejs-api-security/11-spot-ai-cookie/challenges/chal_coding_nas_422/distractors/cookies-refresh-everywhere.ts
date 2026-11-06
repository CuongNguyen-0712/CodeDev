// @piece login-cookies: The cookies sent back after login
return {
    status: 200,
    setCookie: [
        `__Host-cd_at=${tokens.accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ACCESS_TTL_S}`,
        `__Secure-cd_rt=${tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${REFRESH_TTL_S}`,
        `display_name=${encodeURIComponent(user.displayName)}; Domain=codedev.test; Path=/; Secure; SameSite=Lax; Max-Age=${REFRESH_TTL_S}`,
    ],
