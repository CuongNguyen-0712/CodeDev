import { Suspense } from "react";

import FeedbackPage from "@/components/admin/feedback/feedbackPage";
import NoAccess from "@/components/admin/shell/noAccess";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Feedback" };

export default async function AdminFeedbackPage() {
    if (!(await adminCan("feedback.read")) && !(await adminCan("comment.moderate"))) return <NoAccess title="Feedback" />;
    return <Suspense><FeedbackPage /></Suspense>;
}
