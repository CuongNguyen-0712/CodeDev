import AnnouncementsPage from "@/components/admin/announcements/announcementsPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Announcements" };

export default async function AdminAnnouncementsPage() {
    if (!(await adminCan("announcement.send"))) return <NoAccess title="Announcements" />;
    return <AnnouncementsPage />;
}
