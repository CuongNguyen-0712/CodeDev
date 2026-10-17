'use client'

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { courseQueries } from "@/queries/course.query";
import { useApp } from "@/contexts/appContext";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import { PriceTag } from "@/components/commerce/priceTag";
import { PurchaseActions } from "@/components/commerce/purchaseActions";
import { isPremium } from "@/components/commerce/format";

import { LuLink } from "react-icons/lu";

function ChipGroup({ label, items, renderItem }) {
    if (!items.length) return null;
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <dt className="mr-0.5 text-xs font-medium text-muted-foreground">{label}</dt>
            {items.map((item) => (
                <dd key={item.code ?? item.id}>{renderItem(item)}</dd>
            ))}
        </div>
    );
}

// Price, skills, roles and prerequisites, shown under the action row.
function CourseCommerceMeta({ course }) {
    const skills = Array.isArray(course?.skills) ? course.skills : [];
    const roles = Array.isArray(course?.career_roles) ? course.career_roles : [];
    const prerequisites = Array.isArray(course?.prerequisites) ? course.prerequisites : [];

    if (!course) return null;
    if (!isPremium(course) && !skills.length && !roles.length && !prerequisites.length) return null;

    return (
        <dl className="order-last flex basis-full flex-col gap-2 pt-1" aria-label="Course pricing and topics">
            {isPremium(course) && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <dt className="sr-only">Price</dt>
                    <dd><PriceTag course={course} /></dd>
                </div>
            )}
            <ChipGroup
                label="Skills"
                items={skills}
                renderItem={(skill) => <Badge variant="outline" className="text-muted-foreground">{skill.name}</Badge>}
            />
            <ChipGroup
                label="Roles"
                items={roles}
                renderItem={(role) => <Badge variant="muted">{role.name}</Badge>}
            />
            <ChipGroup
                label="Prerequisites"
                items={prerequisites}
                renderItem={(course) => (
                    <Badge asChild variant="link" className="px-0">
                        <Link href={`/course/${course.id}`}>{course.title}</Link>
                    </Badge>
                )}
            />
        </dl>
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

            <CourseCommerceMeta course={data} />
        </div>
    );
}
