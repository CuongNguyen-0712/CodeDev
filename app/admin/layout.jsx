import { notFound, redirect } from "next/navigation";

import Forbidden from "@/components/ui/forbidden";
import AdminShell from "@/components/admin/shell/adminShell";

import { adminEnabled } from "@/lib/adminMode";
import { adminEnvironment, getAdminActor } from "@/lib/adminActor";
import { getAuthSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const TITLE_PREFIX = { production: "PROD · ", staging: "STAGING · ", development: "" };

export async function generateMetadata() {
    const prefix = TITLE_PREFIX[adminEnvironment()];
    return {
        title: { template: `${prefix}%s · Admin`, default: `${prefix}Admin` },
        robots: { index: false, follow: false },
    };
}

/**
 * Every /admin screen: on when ADMIN_ENABLED is not 0, signed in, and admin.read read fresh from
 * the database (a removed role takes effect at once). Each page checks its own permission too.
 */
export default async function AdminLayout({ children }) {
    if (!adminEnabled()) notFound();

    const session = await getAuthSession({ soft: true });
    if (!session?.user?.id) redirect("/auth");

    const actor = await getAdminActor();
    if (!actor?.permissions.has("admin.read")) return <Forbidden />;

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
