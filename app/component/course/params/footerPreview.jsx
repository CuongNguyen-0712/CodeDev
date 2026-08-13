import { useTransition } from "react";

import { useRouterActions } from "@/app/router/useRouterActions";

import { useCourseRegister } from "@/app/mutation/course.mutation";

import { LoadingContent } from "@/app/component/ui/loading";

import { useApp } from "@/app/contexts/appContext";

import { FaArrowLeft } from "react-icons/fa";
import { IoSettingsSharp } from "react-icons/io5";

import "@/app/style/course/[id]/footer.css";

export default function FooterPreview({ courseId, cost, status, loading }) {
    const [isPending, startTransition] = useTransition();

    const { showAlert: alert } = useApp();
    const { navigate, navigateBack } = useRouterActions();

    const useRegister = useCourseRegister();

    const handleSubmit = async () => {
        if (!courseId) return

        if (useRegister.isPending || isPending) return;

        if (Math.round(cost) > 0) {
            alert(400, "The payment feature is not supported yet. Please try again later.");
            return;
        }

        try {
            if (status === 'not_enrolled') {
                await useRegister.mutateAsync(courseId);
            }

            startTransition(() => {
                navigate({ path: `/learning/${courseId}` });
            })
        } catch (error) {
            alert(500, error.message || "An error occurred while registering for the course.");
        }
    }

    return (
        <footer className="preview-footer">
            <button
                className="back-btn"
                onClick={navigateBack}
            >
                <FaArrowLeft fontSize={14} />
                <span>
                    Back
                </span>
            </button>
            <button
                className={`join_btn ${Math.round(cost) === 0 ? 'free' : 'paid'}`}
                disabled={useRegister.isPending || isPending}
                onClick={handleSubmit}
            >
                {
                    (useRegister.isPending || isPending || loading) ?
                        <LoadingContent scale={0.5} color="var(--white)" />
                        :
                        status !== 'not_enrolled' ?
                            (() => {
                                switch (status) {
                                    case 'enrolled': return "Start"
                                    case 'in_progress': return "Continue"
                                    case 'completed': return "Review"
                                    default: return <LoadingContent scale={0.5} color="var(--white)" />
                                }
                            })()
                            :
                            Math.round(cost) === 0 ?
                                "Join for free"
                                :
                                cost
                }
            </button>
            <button
                className="settings-btn"
            >
                <IoSettingsSharp fontSize={16} />
            </button>
        </footer>
    )
}    