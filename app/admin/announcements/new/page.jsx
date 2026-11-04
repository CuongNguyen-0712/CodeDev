import { Suspense } from "react";

import AnnouncementComposer from "@/components/admin/announcements/announcementComposer";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
    if (!(await adminCan("announcement.send"))) return <NoAccess title="New announcement" />;
    return <Suspense><AnnouncementComposer /></Suspense>;
}
