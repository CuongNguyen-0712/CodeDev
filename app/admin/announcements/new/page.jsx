import { Suspense } from "react";

import AnnouncementComposer from "@/components/admin/announcements/announcementComposer";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
    if (!(await adminCan("announcement.send"))) return <NoAccess title="New announcement" />;
    return <Suspense><AnnouncementComposer /></Suspense>;
}
