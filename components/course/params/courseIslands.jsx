'use client'

// The interactive and viewer-specific parts of a course page (components/course/params/courseContent).
// Everything else on the page is rendered on the server from the cached public course.

import { useSession } from "next-auth/react";

import FooterPreview from "./footerPreview";

import { useApp } from "@/contexts/appContext";
import { useRouterActions } from "@/router/useRouterActions";
import { useCourseDetails } from "@/hooks/useCourseDetails";
import { useCourseFavorite, useCourseUnfavorite } from "@/mutations/course.mutation";
import { coverSrcSet, fitCover } from "@/lib/coverFit";
import { PAGE_COVER_SIZES } from "../courseMeta";
import { cn } from "@/lib/utils";
import { PurchaseActions } from "@/components/commerce/purchaseActions";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import { LuArrowLeft, LuHeart } from "react-icons/lu";

// Enrollment status is shown as a tinted badge with a text label, never colour alone.
const ENROLLMENT_STATUS = {
    enrolled: { label: 'Enrolled', variant: 'muted' },
    in_progress: { label: 'In progress', variant: 'primary' },
    completed: { label: 'Completed', variant: 'success' },
    paused: { label: 'Paused', variant: 'warning' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
};

export function BackToCourses() {
    const { navigateBack } = useRouterActions();
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => navigateBack('/course')} aria-label="Back to courses">
                    <LuArrowLeft />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to courses</TooltipContent>
        </Tooltip>
    );
}

export function EnrollmentBadge({ courseId }) {
    const { data } = useCourseDetails(courseId);
    const enrollment = ENROLLMENT_STATUS[data?.status];
    return enrollment ? <Badge variant={enrollment.variant}>{enrollment.label}</Badge> : null;
}

export function CourseActions({ courseId }) {
    const { data, isLoading, viewerPending } = useCourseDetails(courseId);
    const useFavorite = useCourseFavorite();
    const useUnfavorite = useCourseUnfavorite();
    const { showAlert: alert } = useApp();
    const { status: authStatus } = useSession();

    const isFavorite = Boolean(data?.is_favorite);

    const handleSubmitFavorite = () => {
        // One request at a time; the cache already shows the new state.
        if (useFavorite.isPending || useUnfavorite.isPending) return;
        const mutation = data?.is_favorite ? useUnfavorite : useFavorite;
        mutation.mutate({ courseId }, {
            onError: () => alert(500, "Could not update your favorites. Please try again."),
        });
    };

    return (
        <>
            <FooterPreview
                courseId={courseId}
                status={data?.status ?? 'not_enrolled'}
                loading={isLoading || viewerPending}
            />

            {authStatus === 'authenticated' && (
                // Optimistic: the heart flips on click; a failure flips it back and says so.
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleSubmitFavorite}
                    disabled={viewerPending}
                    aria-pressed={isFavorite}
                >
                    <LuHeart
                        className={cn('transition-transform duration-150 active:scale-90', isFavorite && 'fill-destructive text-destructive')}
                        aria-hidden="true"
                    />
                    {isFavorite ? 'Favorited' : 'Add to favorites'}
                </Button>
            )}
        </>
    );
}

export function MobilePurchaseActions({ courseId }) {
    const { data, isLoading, error, refetch, viewerPending } = useCourseDetails(courseId);
    return (
        <PurchaseActions
            courseId={courseId}
            course={data}
            isLoading={isLoading || viewerPending}
            error={error}
            onRetry={refetch}
        />
    );
}

// Covers are usually 16:9 photos, but some courses only have a square language logo (often SVG):
// cropping that to 16:9 cuts it apart, so it is fitted instead. Runs from the ref too, for an
// image the browser finished before hydration.
export function CourseCover({ src }) {
    return (
        // The frame owns the 16:9 box, so nothing shifts while the image loads.
        <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                ref={fitCover}
                src={src}
                srcSet={coverSrcSet(src)}
                sizes={PAGE_COVER_SIZES}
                // The cover is the page's largest paint.
                fetchPriority="high"
                alt=""
                decoding="async"
                className="size-full object-cover data-[fit=contain]:object-contain data-[fit=contain]:p-[10%]"
                onLoad={(e) => fitCover(e.currentTarget)}
                onError={(e) => {
                    // A broken cover adds nothing; hide the frame instead of a placeholder.
                    e.currentTarget.parentElement.hidden = true;
                }}
            />
        </div>
    );
}

export function LanguageLogo({ src }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src || '/image/static/default.svg'}
            alt=""
            width={24}
            height={24}
            className="size-6 object-contain"
            onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/image/static/default.svg';
            }}
        />
    );
}
