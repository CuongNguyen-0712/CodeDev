'use client';

import { useAdmin } from "@/components/admin/adminContext";
import PageHeader from "@/components/admin/shell/pageHeader";
import TabBar from "@/components/admin/ui/tabBar";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import CommentList from "@/components/admin/feedback/commentList";
import FeedbackInbox from "@/components/admin/feedback/feedbackInbox";

const SECTIONS = [
    { key: "feedback", label: "Feedback", permission: "feedback.read" },
    { key: "comments", label: "Course comments", permission: "comment.moderate" },
];

/** What learners say: feedback about CodeDev (feedback.read) and comments on every course (comment.moderate). */
export default function FeedbackPage() {
    const { can } = useAdmin();
    const sections = SECTIONS.filter((item) => can(item.permission));
    const [{ section }, update] = useUrlFilters({ section: sections.map((item) => item.key) }, { section: sections[0]?.key });
    const current = sections.some((item) => item.key === section) ? section : sections[0]?.key;

    return (
        <>
            <PageHeader title="Feedback" description="Feedback sent from the site and comments learners leave on courses." />
            {sections.length > 1 && <TabBar tabs={sections} value={current} onChange={(key) => update({ section: key })} label="Feedback sections" />}
            {current === "comments" ? <CommentList /> : <FeedbackInbox />}
        </>
    );
}
