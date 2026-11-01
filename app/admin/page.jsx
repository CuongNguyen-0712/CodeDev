import AdminOverview from "@/components/admin/overview/adminOverview";
import { adminTitlePrefix } from "@/lib/adminActor";

// The layout title template only applies to child segments, so the index sets the full title.
export async function generateMetadata() {
    return { title: { absolute: `${adminTitlePrefix()}Overview · Admin` } };
}

export default function AdminIndex() {
    return <AdminOverview />;
}
