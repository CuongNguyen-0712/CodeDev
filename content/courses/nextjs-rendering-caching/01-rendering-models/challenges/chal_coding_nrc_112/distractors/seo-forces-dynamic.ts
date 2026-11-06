// @piece invalid-and-personal: Rules 1 and 2: invalid traits, per-user data
if (!isValid(page)) return { route, strategy: "invalid", reason: "invalid traits" };
if (page.perUserData || page.seo) return { route, strategy: "dynamic", reason: "per-user data" };
