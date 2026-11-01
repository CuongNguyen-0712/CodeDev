import { cache } from "react";

import { loadActor } from "@/lib/authz";
import { getAuthSession } from "@/lib/session";

/**
 * The signed-in admin of this request, read once and shared by the admin layout and its page
 * (React cache). Null when signed out, inactive or unknown.
 */
export const getAdminActor = cache(async () => {
    const session = await getAuthSession({ soft: true });
    return session?.user?.id ? loadActor(session.user.id) : null;
});

/** Environment shown in the admin chrome: production, staging (Vercel preview) or development. */
export function adminEnvironment(env = process.env) {
    if (env.APP_ENV === "staging" || env.VERCEL_ENV === "preview") return "staging";
    if (env.APP_ENV === "production" || (!env.APP_ENV && env.NODE_ENV === "production")) return "production";
    return "development";
}
