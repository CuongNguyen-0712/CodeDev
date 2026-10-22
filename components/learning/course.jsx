'use client'
import { useRef, useState, useTransition } from "react"
import Link from "next/link"

import { useRouterActions } from "@/router/useRouterActions"
import { useCourseWithdraw, useCourseFavorite, useCourseUnfavorite } from "@/mutations/course.mutation"
import { levelMapping } from "@/constants/constants"
import { useApp } from "@/contexts/appContext"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/shadcn/alert-dialog"
import { Badge } from "@/components/shadcn/badge"
import { Button, buttonVariants } from "@/components/shadcn/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu"
import { Progress } from "@/components/shadcn/progress"
import { TableCell, TableRow } from "@/components/shadcn/table"

import {
    LuArrowRight,
    LuEllipsis,
    LuFileText,
    LuHeart,
    LuLoaderCircle,
    LuPlay,
    LuRotateCcw,
    LuTrash2,
} from "react-icons/lu"

// Status is always shown as a tinted badge with a text label, never colour alone.
export const COURSE_STATUS = {
    enrolled: { label: 'Not started', variant: 'muted' },
    in_progress: { label: 'In progress', variant: 'primary' },
    completed: { label: 'Completed', variant: 'success' },
    paused: { label: 'Paused', variant: 'warning' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
}

const PRIMARY_ACTION = {
    enrolled: { label: 'Start', Icon: LuPlay },
    completed: { label: 'Review', Icon: LuRotateCcw },
}

export default function LearningCourse({ item, index = 0 }) {
    const [confirmOpen, setConfirmOpen] = useState(false)
    const menuButtonRef = useRef(null)
    const [isNavigating, startTransition] = useTransition()

    const { showAlert: alert } = useApp()
    const { navigate } = useRouterActions()

    const withdrawMutation = useCourseWithdraw()
    const favoriteMutation = useCourseFavorite()
    const unfavoriteMutation = useCourseUnfavorite()

    const totalLessons = item.lessons || 0
    const completedLessons = item.progress ?? 0
    const progressPercent = totalLessons > 0
        ? Math.min(100, Math.max(0, Math.round((completedLessons / totalLessons) * 100)))
        : 0

    // Only a course that has not been started can be withdrawn.
    const canWithdraw = item.status === 'enrolled'
    const isFavorited = Boolean(item.is_favorite)
    const isFavoritePending = favoriteMutation.isPending || unfavoriteMutation.isPending

    const status = COURSE_STATUS[item.status] || { label: 'Unknown', variant: 'muted' }
    const action = PRIMARY_ACTION[item.status] || { label: 'Continue', Icon: LuArrowRight }
    const levelLabel = levelMapping[item.level]?.label || 'Unknown'

    const handleWithdrawCourse = async (event) => {
        // Keep the dialog open until the request settles.
        event.preventDefault()

        try {
            await withdrawMutation.mutateAsync(item.id)
            alert(200, `Withdrew from ${item.title}.`)
            setConfirmOpen(false)
        }
        catch (error) {
            alert(500, "An error occurred while withdrawing from the course.")
        }
    }

    const handleFavoriteCourse = async () => {
        try {
            if (isFavorited) {
                await unfavoriteMutation.mutateAsync({ courseId: item.id })
            } else {
                await favoriteMutation.mutateAsync({ courseId: item.id })
            }
        }
        catch (error) {
            alert(500, "An error occurred while updating favorite status.")
        }
    }

    // A course without published lessons cannot be opened: the button says so instead of a toast.
    const hasLessons = totalLessons > 0

    const handleNavigate = () => {
        if (!hasLessons) return

        startTransition(() => {
            navigate({ path: `/learning/${item.id}` })
        })
    }

    return (
        <TableRow style={{ '--enter-index': index % 20 }} className="animate-enter group/row max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-3 max-lg:gap-y-2.5 max-lg:px-4 max-lg:py-3.5">
            {/* Course */}
            <TableCell className="max-lg:col-span-2 max-lg:p-0 lg:w-full lg:max-w-0 lg:py-3 lg:pl-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={item.language_logo || '/image/static/default.svg'}
                            alt=""
                            width={22}
                            height={22}
                            className="size-[22px] object-contain"
                            onError={(e) => {
                                e.currentTarget.onerror = null
                                e.currentTarget.src = '/image/static/default.svg'
                            }}
                        />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => navigate({ path: `/course/${item.id}` })}
                                className="min-h-6 truncate rounded-sm text-left text-sm font-semibold text-foreground hover:text-primary-ink hover:underline hover:underline-offset-4"
                                title={item.title}
                            >
                                {item.title}
                            </button>
                            {isFavorited && (
                                <LuHeart className="size-3.5 shrink-0 fill-destructive text-destructive" aria-label="Favorite" />
                            )}
                        </div>
                        <p className="truncate tabular text-xs text-muted-foreground">
                            {[item.language_name, item.category_name].filter(Boolean).join(' / ') || 'General'}
                        </p>
                    </div>
                </div>
            </TableCell>

            {/* Level */}
            <TableCell className="text-sm whitespace-nowrap text-muted-foreground max-xl:hidden">
                {levelLabel}
            </TableCell>

            {/* Status */}
            <TableCell className="max-lg:p-0">
                <Badge variant={status.variant}>{status.label}</Badge>
            </TableCell>

            {/* Progress */}
            <TableCell className="max-lg:col-span-2 max-lg:row-start-3 max-lg:p-0">
                <div className="flex items-center gap-3 lg:w-36 xl:w-44">
                    <Progress
                        value={progressPercent}
                        className="h-1.5 flex-1 bg-muted"
                        aria-label={`${item.title} progress`}
                    />
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular">
                        {completedLessons}/{totalLessons}
                    </span>
                </div>
            </TableCell>

            {/* Actions */}
            <TableCell className="max-lg:col-start-2 max-lg:row-start-2 max-lg:p-0 lg:pr-4">
                <div className="flex items-center justify-end gap-1">
                    <Button
                        size="sm"
                        variant={item.status === 'completed' ? 'outline' : 'default'}
                        onClick={handleNavigate}
                        disabled={withdrawMutation.isPending || isNavigating || !hasLessons}
                        className="min-w-24"
                    >
                        {isNavigating ? <LuLoaderCircle className="animate-spin" /> : <action.Icon />}
                        {hasLessons ? action.label : 'No lessons yet'}
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="icon-sm"
                                variant="ghost"
                                ref={menuButtonRef}
                                className="text-muted-foreground data-[state=open]:bg-accent"
                                aria-label={`More actions for ${item.title}`}
                            >
                                <LuEllipsis />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem asChild>
                                <Link href={`/course/${item.id}`}>
                                    <LuFileText />
                                    Course details
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={handleFavoriteCourse} disabled={isFavoritePending}>
                                <LuHeart className={isFavorited ? 'fill-current' : undefined} />
                                {isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                disabled={!canWithdraw || withdrawMutation.isPending}
                                onSelect={() => setConfirmOpen(true)}
                            >
                                <LuTrash2 />
                                <span className="flex flex-col">
                                    Withdraw
                                    {!canWithdraw && (
                                        <span className="text-xs text-muted-foreground">Only before you start</span>
                                    )}
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <AlertDialog open={confirmOpen} onOpenChange={(open) => !withdrawMutation.isPending && setConfirmOpen(open)}>
                    <AlertDialogContent
                        onCloseAutoFocus={(event) => {
                            // Opened from a menu item, so return focus to the row's menu button.
                            event.preventDefault()
                            menuButtonRef.current?.focus()
                        }}
                    >
                        <AlertDialogHeader>
                            <AlertDialogTitle>Withdraw from this course?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You are about to withdraw from{' '}
                                <span className="font-medium text-foreground">{item.title}</span>. Your progress will be saved.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={withdrawMutation.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className={buttonVariants({ variant: 'destructive' })}
                                disabled={withdrawMutation.isPending}
                                onClick={handleWithdrawCourse}
                            >
                                {withdrawMutation.isPending && <LuLoaderCircle className="animate-spin" />}
                                Withdraw
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </TableCell>
        </TableRow>
    )
}
