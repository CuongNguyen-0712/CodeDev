import { Suspense } from "react";

import ChatReports from "@/components/admin/chat/chatReports";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Chat reports" };

export default async function AdminChatReportsPage() {
    if (!(await adminCan("chat.moderate"))) return <NoAccess title="Chat reports" />;
    return <Suspense><ChatReports /></Suspense>;
}
