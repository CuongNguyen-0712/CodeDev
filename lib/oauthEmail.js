const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const GITHUB_NOREPLY = /@users\.noreply\.github\.com$/i;

export const normalizeEmail = (email) => String(email).trim().toLowerCase();

/**
 * The email the provider says it verified, in lower case, or null when it has none.
 * next-auth's GitHub provider picks the primary email without looking at `verified`, so GitHub
 * is always asked again (scope `user:email`). Throws when GitHub cannot be reached.
 */
export async function verifiedProviderEmail({ provider, account, profile }, fetchImpl = fetch) {
    if (provider === "google") {
        return profile?.email_verified === true && profile.email ? normalizeEmail(profile.email) : null;
    }

    if (provider === "github") {
        const res = await fetchImpl(GITHUB_EMAILS_URL, {
            headers: {
                Authorization: `Bearer ${account?.access_token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "CodeDev",
            },
            // A hung api.github.com must not hold the OAuth callback open.
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`GitHub /user/emails failed with ${res.status}`);

        // noreply addresses are "verified" but cannot receive mail.
        const emails = (await res.json()).filter((e) => e?.verified && e.email && !GITHUB_NOREPLY.test(e.email));
        const pick = emails.find((e) => e.primary) || emails[0];
        return pick ? normalizeEmail(pick.email) : null;
    }

    return null;
}
