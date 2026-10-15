import { useTransition } from "react";
import Link from "next/link";

import { useRouterActions } from "@/router/useRouterActions";
import { useCourseRegister } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { useSession } from 'next-auth/react';
import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import { LuArrowRight, LuLink, LuLoaderCircle, LuLogIn, LuPlay, LuPlus, LuRotateCcw } from "react-icons/lu";

// Primary enroll / continue action for the course details header, plus a copy-link button.
// The name is kept from the old bottom bar so existing imports keep working.
export default function FooterPreview({ courseId, cost = 0, status = 'not_enrolled', loading = false, className }) {
    const [isPending, startTransition] = useTransition();

    const { showAlert: alert } = useApp();
    const { navigate } = useRouterActions();
    const { status: authStatus } = useSession();

    const useRegister = useCourseRegister();
    const numericCost = Number(cost || 0);
    const isBusy = useRegister.isPending || isPending || loading;

    const handleSubmit = async () => {
        if (!courseId) return;
        if (useRegister.isPending || isPending) return;

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
                alert(0, "Copy this link: " + window.location.href);
            }
        }
    };

    const getAction = () => {
        switch (status) {
            case 'enrolled':
                return { label: 'Start learning', Icon: LuPlay };
            case 'in_progress':
                return { label: 'Continue learning', Icon: LuArrowRight };
            case 'completed':
                return { label: 'Review course', Icon: LuRotateCcw };
            case 'not_enrolled':
                return {
                    label: numericCost === 0 ? 'Enroll for free' : `Enroll for $${numericCost.toFixed(2)}`,
                    Icon: LuPlus,
                };
            default:
                return { label: 'Continue learning', Icon: LuArrowRight };
        }
    };

    const action = getAction();

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {authStatus === 'authenticated' ? (
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isBusy}
                    className="min-w-40"
                >
                    {isBusy ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <action.Icon aria-hidden="true" />}
                    {useRegister.isPending ? 'Enrolling...' : action.label}
                </Button>
            ) : authStatus === 'unauthenticated' ? (
                <Button asChild>
                    <Link href="/auth">
                        <LuLogIn aria-hidden="true" />
                        Sign in to enroll
                    </Link>
                </Button>
            ) : null}

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleShare}
                        aria-label="Copy course link"
                    >
                        <LuLink />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Copy course link</TooltipContent>
            </Tooltip>
        </div>
    );
}
