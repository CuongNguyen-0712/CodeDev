import { cache } from "react";

import { appEnv } from "@/lib/appEnv.mjs";
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

/** Environment shown in the admin chrome; a Vercel preview without APP_ENV counts as staging. */
export function adminEnvironment(env = process.env) {
    const current = appEnv(env);
    if (current === "staging" || env.VERCEL_ENV === "preview") return "staging";
    return current === "production" ? "production" : "development";
}

const TITLE_PREFIX = { production: "PROD · ", staging: "STAGING · ", development: "" };

/** Tab title prefix that keeps production and staging apart (docs/admin-panel-plan.md 2.1). */
export const adminTitlePrefix = (env = process.env) => TITLE_PREFIX[adminEnvironment(env)];
