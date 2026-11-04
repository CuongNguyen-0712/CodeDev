import UserDetail from "@/components/admin/users/userDetail";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "User" };

export default async function UserPage({ params }) {
    if (!(await adminCan("user.read"))) return <NoAccess title="User" />;
    const { id } = await params;
    return <UserDetail userId={decodeURIComponent(id)} />;
}
