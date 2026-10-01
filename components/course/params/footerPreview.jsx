import { useTransition } from "react";

import { useRouterActions } from "@/router/useRouterActions";
import { useCourseRegister } from "@/mutations/course.mutation";
import { LoadingContent } from "@/components/ui/loading";
import { useApp } from "@/contexts/appContext";
import { useSession } from 'next-auth/react';

import { FaArrowLeft } from "react-icons/fa";
import { IoShareSocial } from "react-icons/io5";

import "@/styles/course/[id]/footer.css";

export default function FooterPreview({ courseId, cost = 0, status = 'not_enrolled', loading = false }) {
    const [isPending, startTransition] = useTransition();

    const { showAlert: alert } = useApp();
    const { navigate, navigateBack } = useRouterActions();
    const { data: session } = useSession();

    const useRegister = useCourseRegister();
    const numericCost = Number(cost || 0);

    const handleSubmit = async () => {
        if (!courseId) return;
        if (useRegister.isPending || isPending) return;

        if (!session || !session.user) {
            alert(401, "You must be logged in to register for this course.");
            return;
        }

        if (status !== 'not_enrolled') {
            startTransition(() => {
                navigate({ path: `/learning/${courseId}` });
            });
            return;
        }

        if (numericCost > 0) {
            alert(400, "Paid enrollment feature is currently in preview. Please try free courses.");
            return;
        }

        try {
            await useRegister.mutateAsync(courseId);
            startTransition(() => {
                navigate({ path: `/learning/${courseId}` });
            });
        } catch (error) {
            alert(500, error.message || "An error occurred while registering for the course.");
        }
    };

    const handleShare = async () => {
        if (typeof window !== 'undefined') {
            try {
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(window.location.href);
                    alert(200, "Course link copied to clipboard!");
                }
            } catch {
                alert(200, "Course URL: " + window.location.href);
            }
        }
    };

    const getActionLabel = () => {
        if (useRegister.isPending || isPending || loading) {
            return <LoadingContent scale={0.5} color="var(--white)" />;
        }

        switch (status) {
            case 'enrolled':
                return "Start Learning";
            case 'in_progress':
                return "Continue Learning";
            case 'completed':
                return "Review Course";
            default:
                return numericCost === 0 ? "Enroll for Free" : `Enroll · $${numericCost.toFixed(2)}`;
        }
    };

    return (
        <footer className="preview-footer">
            <div className="footer-inner">
                <button
                    type="button"
                    className="back-btn"
                    onClick={() => navigateBack('/course')}
                    title="Back to courses"
                    aria-label="Back to courses"
                >
                    <FaArrowLeft fontSize={14} />
                    <span>Back</span>
                </button>

                <button
                    type="button"
                    className={`join_btn ${numericCost === 0 ? 'free' : 'paid'} ${status !== 'not_enrolled' ? 'enrolled' : ''}`}
                    disabled={useRegister.isPending || isPending || loading}
                    onClick={handleSubmit}
                >
                    {getActionLabel()}
                </button>

                <button
                    type="button"
                    className="share-btn"
                    onClick={handleShare}
                    title="Share Course"
                    aria-label="Share Course"
                >
                    <IoShareSocial fontSize={18} />
                </button>
            </div>
        </footer>
    );
}    