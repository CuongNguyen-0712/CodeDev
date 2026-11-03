'use client';

import { useEffect, useState } from "react";

import { useCourseRate } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { LEVEL_UP_CLOSED_EVENT, LEVEL_UP_EVENT } from "@/components/ui/level";
import { RatingStars } from "@/components/course/ratingStars";

import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";

const RATE_PROMPT_EVENT = "codedev:rate-course";

/** Asks for a course rating after a lesson completion that returned `ratePrompt` (plan 12.3). */
export function askForRating({ courseId, prompt }) {
    if (!courseId || !prompt || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(RATE_PROMPT_EVENT, { detail: { courseId, stars: prompt.stars ?? null } }));
}

/**
 * Mounted once in the root providers, like the level-up dialog, so it survives the lesson view
 * reloading after a completion. Opens only once the level-up dialog of the same completion is closed.
 */
export function RatePromptDialog() {
    const [request, setRequest] = useState(null);
    const [stars, setStars] = useState(0);
    const [levelUpOpen, setLevelUpOpen] = useState(false);
    const { showAlert: alert } = useApp();
    const rate = useCourseRate();

    useEffect(() => {
        const onPrompt = (event) => {
            setRequest(event.detail);
            setStars(event.detail.stars || 0);
        };
        const onLevelUp = () => setLevelUpOpen(true);
        const onLevelUpClosed = () => setLevelUpOpen(false);
        window.addEventListener(RATE_PROMPT_EVENT, onPrompt);
        window.addEventListener(LEVEL_UP_EVENT, onLevelUp);
        window.addEventListener(LEVEL_UP_CLOSED_EVENT, onLevelUpClosed);
        return () => {
            window.removeEventListener(RATE_PROMPT_EVENT, onPrompt);
            window.removeEventListener(LEVEL_UP_EVENT, onLevelUp);
            window.removeEventListener(LEVEL_UP_CLOSED_EVENT, onLevelUpClosed);
        };
    }, []);

    const updating = Boolean(request?.stars);

    const save = async () => {
        try {
            await rate.mutateAsync({ courseId: request.courseId, stars });
            alert(200, updating ? "Your rating was updated." : "Thanks for rating this course.");
            setRequest(null);
        } catch (error) {
            alert(error?.status || 500, error?.message || "Could not save your rating. Please try again.");
        }
    };

    return (
        <Dialog open={Boolean(request) && !levelUpOpen} onOpenChange={(open) => !open && setRequest(null)}>
            <DialogContent className="sm:max-w-sm text-center">
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
                    <Button variant="outline" onClick={() => setRequest(null)} disabled={rate.isPending}>Not now</Button>
                    <Button onClick={save} disabled={!stars || rate.isPending}>{rate.isPending ? "Saving..." : "Save rating"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
