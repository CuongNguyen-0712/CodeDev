'use client'

import { useQuery } from "@tanstack/react-query";

import { courseQueries } from "@/queries/course.query";
import { useApp } from "@/contexts/appContext";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/shadcn/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import { PurchaseActions } from "@/components/commerce/purchaseActions";

import { LuBriefcase, LuChevronDown, LuLink, LuSparkles } from "react-icons/lu";

// One compact button ("4 skills") that opens the full list, instead of a row of chips.
function TopicPopover({ icon: Icon, count, noun, title, items }) {
    if (!items.length) return null;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="text-muted-foreground">
                    <Icon aria-hidden="true" />
                    <span className="tabular">{count}</span> {count === 1 ? noun : `${noun}s`}
                    <LuChevronDown className="size-3.5" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto max-w-[min(20rem,calc(100vw-2rem))]">
                <PopoverHeader>
                    <PopoverTitle>{title}</PopoverTitle>
                </PopoverHeader>
                <ul className="mt-3 flex list-none flex-wrap gap-1.5 p-0">
                    {items.map((item) => (
                        <li key={item.code ?? item.id}>
                            <Badge variant="outline" className="whitespace-normal text-muted-foreground">{item.name}</Badge>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

// Skills and roles under the action row, each behind a button so the header stays calm.
// Price is in the header badge and prerequisites in the course information card.
function CourseTopics({ course }) {
    const skills = Array.isArray(course?.skills) ? course.skills : [];
    const roles = Array.isArray(course?.career_roles) ? course.career_roles : [];
    if (!skills.length && !roles.length) return null;

    return (
        <div className="order-last flex basis-full flex-wrap items-center gap-2 pt-1">
            <TopicPopover icon={LuSparkles} count={skills.length} noun="skill" title="Skills you practise" items={skills} />
            <TopicPopover icon={LuBriefcase} count={roles.length} noun="role" title="Built for these roles" items={roles} />
        </div>
    );
}

// Primary purchase / enroll / continue action for the course details header, plus a copy-link
// button. The name and props are kept from the old bottom bar so existing imports keep working;
// The `cost` and `status` props are still accepted but ignored: price, ownership and enrolment
// come from the (shared, already cached) details query.
export default function FooterPreview({ courseId, loading = false, className }) {
    const { showAlert: alert } = useApp();
    const { data, isLoading, error, refetch } = useQuery(courseQueries.details(courseId));

    const handleShare = async () => {
        if (typeof window === 'undefined') return;
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(window.location.href);
                alert(200, "Course link copied to clipboard!");
            }
        } catch {
            alert(0, "Copy this link: " + window.location.href);
        }
    };

    return (
        <div className={cn("contents", className)}>
            <PurchaseActions
                courseId={courseId}
                course={data}
                isLoading={loading || isLoading}
                error={error}
                onRetry={refetch}
            />

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

            <CourseTopics course={data} />
        </div>
    );
}
