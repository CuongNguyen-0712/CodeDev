// @piece cookie-list: Login cookies and their clearing cookies
return {
    ok: true,
    login: [
        header(config.accessName, accessToken, config.accessTtlSeconds, at(config.accessTtlSeconds), "/", config.sameSite),
        header(config.refreshName, refreshToken, config.refreshTtlSeconds, at(config.refreshTtlSeconds), config.refreshPath, config.sameSite),
    ],
    logout: [
        header(config.accessName, "", 0, EPOCH, "/", config.sameSite),
        header(config.refreshName, "", 0, EPOCH, config.refreshPath, config.sameSite),
    ],
};
