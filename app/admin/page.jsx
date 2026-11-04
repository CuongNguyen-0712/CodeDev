import AdminOverview from "@/components/admin/overview/adminOverview";
import { adminTitlePrefix } from "@/lib/adminActor";

// The layout title template only applies to child segments, so the index sets the full title.
// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export async function generateMetadata() {
    return { title: { absolute: `${adminTitlePrefix()}Overview · Admin` } };
}

export default function AdminIndex() {
    return <AdminOverview />;
}
