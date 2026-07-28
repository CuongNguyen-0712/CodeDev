import { useTransition } from "react";

import { useQuery } from "@tanstack/react-query";

import { userQueries } from "@/app/query/user.query";

import { useSession } from "next-auth/react";

import { useRouterActions } from "@/app/router/useRouterActions";

import { useCourseRegister } from "@/app/mutation/course.mutation";

import { LoadingContent } from "@/app/component/ui/loading";

import { useApp } from "@/app/contexts/appContext";

export default function FooterPreview({ courseId }) {
    const [isPending, startTransition] = useTransition();

    const { status } = useSession()

    const { showAlert: alert } = useApp();
    const { navigate } = useRouterActions();

    const useRegister = useCourseRegister();
    const { data, isLoading, isError, error } = useQuery(userQueries.courseProgress(status, { courseId: courseId }));

    const course = data?.[0]

    const handleSubmit = async () => {
        if (!course) return

        if (isLoading || isError || useRegister.isPending || isPending) return;

        if (Math.round(course?.cost) > 0) {
            alert(400, "The payment feature is not supported yet. Please try again later.");
            return;
        }

        try {
            if (course.status === null) {
                await useRegister.mutateAsync(courseId);
            }

            startTransition(() => {
                navigate({ path: `/learning/${courseId}` });
            })
        } catch (error) {
            alert(500, error.message || "An error occurred while registering for the course.");
        }
    }

    if (error) {
        alert(500, error.message || "An error occurred while fetching course progress.");
    }

    return (
        <footer className="preview-footer">
            <button
                className={`join_btn ${Math.round(course?.cost) === 0 ? 'free' : 'paid'}`}
                disabled={isLoading || isError || useRegister.isPending || isPending}
                onClick={handleSubmit}
            >
                {
                    (isLoading || useRegister.isPending || isPending) ?
                        <LoadingContent scale={0.5} color="var(--white)" />
                        :
                        Math.round(course?.cost) === 0 ?
                            (() => {
                                switch (course?.status) {
                                    case 'enrolled': return "Start learning"
                                    case 'in_progress': return "Continue learning"
                                    case 'completed': return "Review course"
                                    case null: return "Join course"
                                    default: return <LoadingContent scale={0.5} color="var(--white)" />
                                }
                            })()
                            :
                            course?.cost
                }
            </button>
        </footer>
    )
}    