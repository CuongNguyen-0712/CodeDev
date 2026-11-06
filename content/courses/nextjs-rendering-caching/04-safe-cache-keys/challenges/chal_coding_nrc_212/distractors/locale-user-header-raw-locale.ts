// @piece locale-user-header: Add locale and user, then pick Cache-Control
if (spec.localized) key += `|locale=${req.locale ?? DEFAULT_LOCALE}`;
if (spec.classification === "per-user") {
    key += `|user=${encodeURIComponent(userId)}`;
    return { key, cacheControl: "private, no-cache" };
}
return { key, cacheControl: `public, max-age=0, s-maxage=${spec.sMaxAge}` };
