import { Suspense } from "react";

import UserList from "@/components/admin/users/userList";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Users" };

export default async function UsersPage() {
    if (!(await adminCan("user.read"))) return <NoAccess title="Users" />;
    // useSearchParams needs a Suspense boundary.
    return <Suspense><UserList /></Suspense>;
}
