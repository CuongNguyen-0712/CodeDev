import { Suspense } from "react";

import BlogQueue from "@/components/admin/blog/blogQueue";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Blog" };

export default async function AdminBlogPage() {
    if (!(await adminCan("blog.moderate"))) return <NoAccess title="Blog" />;
    return <Suspense><BlogQueue /></Suspense>;
}
