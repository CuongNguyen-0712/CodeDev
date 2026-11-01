import AccessAdmin from "@/components/admin/accessAdmin";
import NoAccess from "@/components/admin/shell/noAccess";
import PageHeader from "@/components/admin/shell/pageHeader";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Access" };

export default async function AccessPage() {
    if (!(await adminCan("entitlement.grant")) && !(await adminCan("points.adjust"))) return <NoAccess title="Access" />;
    return (
        <>
            <PageHeader title="Access" description="Course access, points and EXP of one learner." />
            <AccessAdmin />
        </>
    );
}
