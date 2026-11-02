'use client';

import { useQuery } from "@tanstack/react-query";

import { adminQueries } from "@/queries/premium.query";
import Finding, { plural } from "@/components/admin/ui/finding";

// Findings for screens whose title row is rendered on the server: they read the same query as the
// screen below them, so React Query serves both from one request.

export function CoursesFinding({ fallback }) {
    const { data } = useQuery(adminQueries.courses());
    if (!data) return fallback;
    const courses = data.courses || [];
    const count = (status) => courses.filter((course) => course.publishStatus === status).length;
    const enrolments = courses.filter((course) => course.publishStatus === "published").reduce((sum, course) => sum + (Number(course.students) || 0), 0);
    const drafts = count("draft");
    const live = `${plural(count("published"), "course")} live with ${plural(enrolments, "enrolment")}.`;
    return drafts
        ? <Finding tone="attention">{`${plural(drafts, "draft")} not published yet · ${live}`}</Finding>
        : <Finding tone="good">{live}</Finding>;
}

export function OrdersFinding({ fallback }) {
    const { data } = useQuery(adminQueries.orders());
    if (!data) return fallback;
    if (data.length === 0) return "No course has been bought yet. Purchases with points and online payment land here.";
    const refunds = data.filter((order) => order.failure_reason === "already_owned_refund_required").length;
    const failed = data.filter((order) => order.status === "failed").length;
    const completed = data.filter((order) => order.status === "completed").length;
    const summary = `${plural(completed, "completed order")} of the latest ${data.length}.`;
    if (refunds) return <Finding tone="critical">{`${plural(refunds, "order")} paid for a course the learner already owns: refund ${refunds === 1 ? "it" : "them"}. ${summary}`}</Finding>;
    if (failed) return <Finding tone="attention">{`${plural(failed, "payment")} failed · ${summary}`}</Finding>;
    return <Finding tone="good">{summary}</Finding>;
}
