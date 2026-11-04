'use client';

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { courseQueries } from "@/queries/course.query";
import { useCourseRate } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { cn } from "@/lib/utils";

import { LuStar } from "react-icons/lu";

const STARS = [1, 2, 3, 4, 5];

/** 1-5 stars as a native radio group (arrow keys move, Space picks); hover previews the choice. */
export function RatingStars({ value, onChange, label = "Your rating", disabled = false, size = "md" }) {
    const name = useId();
    const [hover, setHover] = useState(0);
    const shown = hover || value || 0;
    const icon = size === "lg" ? "size-8" : "size-5";

    return (
        <div role="radiogroup" aria-label={label} className="flex items-center" onMouseLeave={() => setHover(0)}>
            {STARS.map((stars) => (
                <label
                    key={stars}
                    onMouseEnter={() => !disabled && setHover(stars)}
                    className={cn(
                        "rounded-md p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        disabled ? "cursor-default" : "cursor-pointer"
                    )}
                >
                    <input
                        type="radio"
                        name={name}
                        value={stars}
                        checked={value === stars}
                        onChange={() => onChange(stars)}
                        disabled={disabled}
                        className="sr-only"
                    />
                    <LuStar
                        className={cn(icon, "transition-colors", stars <= shown ? "text-xp fill-xp" : "text-muted-foreground")}
                        aria-hidden="true"
                    />
                    <span className="sr-only">{stars === 1 ? "1 star" : `${stars} stars`}</span>
                </label>
            ))}
        </div>
    );
}

/** A comment author's own rating of the course, beside their name. */
export function AuthorStars({ stars }) {
    if (!stars) return null;
    return (
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-foreground tabular" title={`Rated this course ${stars} out of 5`}>
            <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
            <span className="sr-only">Rated this course</span>
            {stars}
            <span className="sr-only">out of 5</span>
        </span>
    );
}

/** The learner's rating of this course, saved on click; shown only to enrolled learners with a completed lesson. */
export function YourRating({ courseId }) {
    const { status } = useSession();
    const { showAlert: alert } = useApp();
    const { data } = useQuery(courseQueries.rating(courseId, status));
    const rate = useCourseRate();

    if (!data?.eligible) return null;

    const save = async (stars) => {
        try {
            await rate.mutateAsync({ courseId, stars });
            alert(200, data.stars ? "Your rating was updated." : "Thanks for rating this course.");
        } catch (error) {
            alert(error?.status || 500, error?.message || "Could not save your rating. Please try again.");
        }
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Your rating</span>
            <RatingStars value={data.stars} onChange={save} disabled={rate.isPending} />
        </div>
    );
}
