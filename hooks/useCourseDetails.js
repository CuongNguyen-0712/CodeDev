'use client';

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { courseQueries } from "@/queries/course.query";

/**
 * A course page's data: the public details (rendered on the server, same for everyone) merged with
 * the signed-in viewer's own columns, which load in the browser. `viewerPending` is true until it is
 * known what this viewer sees, so enrolment and purchase actions are not shown as a guest's first.
 */
export function useCourseDetails(courseId) {
    const { status } = useSession();
    const details = useQuery(courseQueries.details(courseId));
    const viewer = useQuery(courseQueries.viewer(status, courseId));

    const data = useMemo(
        () => (details.data && viewer.data ? { ...details.data, ...viewer.data } : details.data),
        [details.data, viewer.data]
    );

    return {
        ...details,
        data,
        viewerPending: status === 'loading' || (status === 'authenticated' && viewer.isPending),
    };
}
