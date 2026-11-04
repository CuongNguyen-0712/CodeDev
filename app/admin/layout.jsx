import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import Forbidden from "@/components/ui/forbidden";
import AdminShell from "@/components/admin/shell/adminShell";
import MfaGate from "@/components/admin/mfa/mfaGate";

import { adminEnabled, adminIpAllowed } from "@/lib/adminMode";
import { adminEnvironment, adminTitlePrefix, getAdminActor, getAdminSession } from "@/lib/adminActor";
import { RateLimiter } from "@/lib/rateLimit";
import { adminMfaService, mfaRequiredFor } from "@/services/adminMfa.service";

// Gated per request (session, permissions, address, second factor), so navigations here wait for the server.
export const instant = false;

export async function generateMetadata() {
    const prefix = adminTitlePrefix();
    return {
        title: { template: `${prefix}%s · Admin`, default: `${prefix}Admin` },
        robots: { index: false, follow: false },
    };
}

/**
 * Every /admin screen: on when ADMIN_ENABLED is not 0, from an allowed address (ADMIN_IP_ALLOWLIST),
 * signed in, admin.read read fresh from the database, and, for admin and super admin, a session
 * that passed the second factor (enrolment first). Each page checks its own permission too.
 */
export default async function AdminLayout({ children }) {
    if (!adminEnabled()) notFound();
    if (!adminIpAllowed(RateLimiter.getClientIp(await headers(), { trustedOnly: true }))) notFound();

    const session = await getAdminSession();
    if (!session?.user?.id) redirect("/auth?next=/admin");

    const actor = await getAdminActor();
    if (!actor?.permissions.has("admin.read")) return <Forbidden />;

    if (mfaRequiredFor(actor)) {
        const factor = await adminMfaService.status({ actor, sessionId: session.user.sessionId ? String(session.user.sessionId) : null });
        if (!factor.enrolled) return <MfaGate mode="enroll" />;
        if (!factor.verified) return <MfaGate mode="verify" />;
    }

    return (
        <AdminShell
            permissions={[...actor.permissions]}
            environment={adminEnvironment()}
            user={{ username: session.user.username || session.user.name || session.user.email }}
        >
            {children}
        </AdminShell>
    );
}
