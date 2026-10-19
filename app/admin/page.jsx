import { Suspense } from "react";
import { redirect } from "next/navigation";

import HomeLayout from "@/components/layouts/homeLayout";
import { LoadingRedirect } from "@/components/ui/loading";
import Forbidden from "@/components/ui/forbidden";
import AdminPage from "@/components/admin/adminPage";

import { loadActor } from "@/lib/authz";
import { getAuthSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
    return {
        title: "Admin | CodeDev",
        description: "Course, pricing and access management",
        robots: { index: false, follow: false },
    };
}

// Permissions the admin screens care about (the APIs check them again on every request).
const ADMIN_PERMISSIONS = [
    "admin.read", "course.update", "course.publish", "course.price",
    "points.adjust", "order.list", "order.refund", "entitlement.grant",
];

export default async function Page() {
    const session = await getAuthSession({ soft: true });
    if (!session?.user?.id) redirect("/auth");

    // Fresh from the database (not the JWT): a removed role takes effect immediately.
    const actor = await loadActor(session.user.id);
    // Keep the app shell so a denied user can still navigate away.
    if (!actor?.permissions.has("admin.read")) return <HomeLayout><Forbidden /></HomeLayout>;

    const permissions = ADMIN_PERMISSIONS.filter((permission) => actor.permissions.has(permission));

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <AdminPage permissions={permissions} />
            </HomeLayout>
        </Suspense>
    );
}
