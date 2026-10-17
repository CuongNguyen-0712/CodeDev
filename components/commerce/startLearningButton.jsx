'use client'

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useCourseRegister } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";

import { Button } from "@/components/shadcn/button";

import { LuLoaderCircle, LuPlay } from "react-icons/lu";

import { commerceErrorMessage } from "./format";

/**
 * Enrols (idempotent on the server: re-enrolling an owned course is fine) and opens the course.
 * Access is decided by the server: a 403 here means the purchase has not landed yet.
 */
export function StartLearningButton({ courseId, label = "Start learning", icon: Icon = LuPlay, onStarted, ...props }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const register = useCourseRegister();
    const [isNavigating, startTransition] = useTransition();

    const busy = register.isPending || isNavigating;

    const handleClick = async () => {
        if (!courseId || busy) return;
        try {
            await register.mutateAsync(courseId);
            onStarted?.();
            startTransition(() => router.push(`/learning/${courseId}`));
        } catch (error) {
            showAlert(error?.status || 500, commerceErrorMessage(error, "Could not start this course. Please try again."));
        }
    };

    return (
        <Button type="button" onClick={handleClick} disabled={busy} aria-busy={busy} {...props}>
            {busy ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}
            {register.isPending ? 'Opening course...' : label}
        </Button>
    );
}

export default StartLearningButton;
