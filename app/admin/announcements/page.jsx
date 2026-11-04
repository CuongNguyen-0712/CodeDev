import AnnouncementsPage from "@/components/admin/announcements/announcementsPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Announcements" };

export default async function AdminAnnouncementsPage() {
    if (!(await adminCan("announcement.send"))) return <NoAccess title="Announcements" />;
    return <AnnouncementsPage />;
}
