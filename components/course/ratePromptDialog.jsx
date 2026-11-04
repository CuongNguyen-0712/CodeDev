'use client';

import { useState } from "react";

import { useCourseRate } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { selectRatePromptOpen, useRewardsStore } from "@/stores/rewardsStore";
import { RatingStars } from "@/components/course/ratingStars";

import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";

/** Asks for a course rating after a lesson completion that returned `ratePrompt` (plan 12.3). */
export function askForRating({ courseId, prompt }) {
    if (!courseId || !prompt) return;
    useRewardsStore.getState().askForRating({ courseId, stars: prompt.stars ?? null });
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
                {/* Keyed per request, so the star choice starts from that request's saved rating. */}
                {shown && <RatePromptForm key={shown.courseId} request={shown} onDone={close} />}
            </DialogContent>
        </Dialog>
    );
}

function RatePromptForm({ request, onDone }) {
    const [stars, setStars] = useState(request.stars || 0);
    const { showAlert: alert } = useApp();
    const rate = useCourseRate();
    const updating = Boolean(request.stars);

    const save = async () => {
        try {
            await rate.mutateAsync({ courseId: request.courseId, stars });
            alert(200, updating ? "Your rating was updated." : "Thanks for rating this course.");
            onDone();
        } catch (error) {
            alert(error?.status || 500, error?.message || "Could not save your rating. Please try again.");
        }
    };

    return (
        <>
            <DialogHeader className="items-center">
                <DialogTitle className="text-xl">{updating ? "Update your rating?" : "How is this course so far?"}</DialogTitle>
                <DialogDescription>
                    {updating
                        ? "You finished the course. Keep your rating or change it now that you have seen all of it."
                        : "Your rating helps other learners choose. You can change it later from the course page."}
                </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-1">
                <RatingStars value={stars} onChange={setStars} label="Rate this course" size="lg" disabled={rate.isPending} />
            </div>
            <DialogFooter className="sm:justify-center">
                <Button variant="outline" onClick={onDone} disabled={rate.isPending}>Not now</Button>
                <Button onClick={save} disabled={!stars || rate.isPending}>{rate.isPending ? "Saving..." : "Save rating"}</Button>
            </DialogFooter>
        </>
    );
}
