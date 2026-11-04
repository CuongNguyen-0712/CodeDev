import ContentKpiAdmin from "@/components/admin/contentKpiAdmin";
import PageHeader from "@/components/admin/shell/pageHeader";

// The admin layout gates every request (`instant = false` there), but Next validates each page
// segment on its own, so without this the layout session read is reported as blocking navigation.
export const instant = false;

export const metadata = { title: "Challenges" };

export default function ChallengesPage() {
    return (
        <>
            <PageHeader title="Challenges" description="Pass rate and attempts before a pass, per course." />
            <ContentKpiAdmin />
        </>
    );
}
