import { notFound } from "next/navigation";

import SettingsPage from "@/components/admin/settings/settingsPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";
import { SETTINGS_SECTIONS } from "@/lib/adminPermissions";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage({ params }) {
    if (!(await adminCan("platform.settings"))) return <NoAccess title="Settings" />;
    const { section } = await params;
    if (!SETTINGS_SECTIONS.some((item) => item.key === section)) notFound();
    return <SettingsPage section={section} />;
}
