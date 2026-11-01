import ContentKpiAdmin from "@/components/admin/contentKpiAdmin";
import PageHeader from "@/components/admin/shell/pageHeader";

export const metadata = { title: "Challenges" };

export default function ChallengesPage() {
    return (
        <>
            <PageHeader title="Challenges" description="Pass rate and attempts before a pass, per course." />
            <ContentKpiAdmin />
        </>
    );
}
