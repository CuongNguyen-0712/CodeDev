'use client';

import { useState } from "react";

import { useCourseRate } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { selectRatePromptOpen, useRewardsStore } from "@/stores/rewardsStore";
import { RatingStars } from "@/components/course/ratingStars";

import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";

// Exact copy per milestone (docs/superpowers/specs/2026-11-10-course-rating-section-design.md).
const COPY = {
    20: {
        title: "You're 20% in: how is the course so far?",
        description: "Your rating helps other learners choose. You can rate it again at 50% and when you finish.",
    },
    50: {
        title: "Halfway there: how is the course now?",
        description: "Rate it again now that you are halfway. Your earlier rating stays as it was.",
    },
    100: {
        title: "You finished the course: how was it?",
        description: "This rating now counts for the course average.",
    },
};

/** Asks for a course rating after a lesson completion whose `ratePrompt` opened a milestone. */
export function askForRating({ courseId, prompt }) {
    if (!courseId || !COPY[prompt?.milestone]) return;
    useRewardsStore.getState().askForRating({ courseId, milestone: prompt.milestone });
}

/**
 * Mounted once in the root providers, like the level-up dialog, so it survives the lesson view
 * reloading after a completion. Opens only once the level-up dialog of the same completion is closed
 * (selectRatePromptOpen in stores/rewardsStore.js).
 */
export function RatePromptDialog() {
    const request = useRewardsStore((s) => s.ratePrompt);
    const open = useRewardsStore(selectRatePromptOpen);
    const close = useRewardsStore((s) => s.closeRatePrompt);
    // The last request stays rendered while the dialog fades out after close() cleared it.
    const [shown, setShown] = useState(request);
    if (request && request !== shown) setShown(request);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && close()}>
            <DialogContent className="sm:max-w-sm text-center">
                {/* Keyed per request, so each milestone starts from no stars. */}
                {shown && <RatePromptForm key={`${shown.courseId}:${shown.milestone}`} request={shown} onDone={close} />}
            </DialogContent>
        </Dialog>
    );
}

function RatePromptForm({ request, onDone }) {
    const [stars, setStars] = useState(0);
    const { showAlert: alert } = useApp();
    const rate = useCourseRate();
    const copy = COPY[request.milestone];

    const save = async () => {
        try {
            await rate.mutateAsync({ courseId: request.courseId, stars });
            alert(200, "Thanks for rating this course.");
            onDone();
        } catch (error) {
            alert(error?.status || 500, error?.message || "Could not save your rating. Please try again.");
            // Already voted (the course page, another tab) or nothing open: retrying can never succeed.
            if (error?.code === "RATING_CLOSED" || error?.code === "RATING_NOT_ALLOWED") onDone();
        }
    };

    return (
        <>
            <DialogHeader className="items-center">
                <DialogTitle className="text-xl">{copy.title}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-1">
                <RatingStars value={stars} onChange={setStars} label="Rate this course" size="lg" disabled={rate.isPending} />
            </div>
            <DialogFooter className="sm:justify-center">
                <Button variant="outline" onClick={onDone} disabled={rate.isPending}>Not now</Button>
                <Button onClick={save} disabled={!stars || rate.isPending}>{rate.isPending ? "Saving…" : "Save rating"}</Button>
            </DialogFooter>
        </>
    );
}
