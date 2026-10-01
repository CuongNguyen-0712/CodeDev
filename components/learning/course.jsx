import { useState, useTransition } from "react"
import { useRouterActions } from "@/router/useRouterActions"
import { useCourseWithdraw, useCourseFavorite, useCourseUnfavorite } from "@/mutations/course.mutation"
import { LoadingContent } from "../ui/loading"
import { levelMapping, progressMapping } from "@/constants/constants"
import Link from "next/link"
import { useApp } from "@/contexts/appContext"

import { FaGraduationCap, FaCode, FaPlay } from "react-icons/fa"
import { MdCategory } from "react-icons/md"
import { GoHeartFill } from "react-icons/go"
import { IoSettingsSharp, IoTrashBin, IoClose, IoReload, IoArchive } from "react-icons/io5"
import { VscDebugContinue } from "react-icons/vsc"
import { BiDetail } from "react-icons/bi"

import "@/styles/learning/course.css"

export default function LearningCourse({ item }) {
    const [openSetting, setOpenSetting] = useState(false)
    const [formConfirm, setFormConfirm] = useState(null)
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

    const isArchived = item.status !== 'enrolled'
    const isFavorited = Boolean(item.is_favorite)

    const handleWithdrawCourse = async (e) => {
        e.preventDefault()

        try {
            await withdrawMutation.mutateAsync(item.id)
            alert(200, `Successfully withdrew from course: ${item.title}`)
            setFormConfirm(null)
            setOpenSetting(false)
        }
        catch (error) {
            alert(500, "An error occurred while withdrawing from the course.")
        }
    }

    const handleFavoriteCourse = async (e) => {
        e.preventDefault()

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

    const handleNavigate = () => {
        if (totalLessons === 0) {
            alert(500, "This course has no lessons available yet.")
            return
        }

        startTransition(() => {
            navigate({ path: `/learning/${item.id}` })
        })
    }

    const levelLabel = levelMapping[item.level]?.label || 'Unknown'

    const statusBadge = progressMapping[item.status] || { label: 'Unknown', className: 'unknown' }

    return (
        <div className="learning-card">
            {/* Card Header */}
            <div className="card-header">
                <div className="header-left">
                    <div className="learning-icon">
                        <img
                            src={item.language_logo || '/image/static/no_image.png'}
                            alt={item.language_name || 'Language'}
                            onError={(e) => {
                                e.target.onerror = null
                                e.target.src = '/image/static/no_image.png'
                            }}
                        />
                    </div>
                    <span className={`status-pill ${statusBadge.className}`}>
                        {statusBadge.label}
                    </span>
                </div>

                <button
                    className={`bookmark-btn ${isFavorited ? 'active' : ''}`}
                    onClick={handleFavoriteCourse}
                    title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                    aria-label="Bookmark course"
                    disabled={favoriteMutation.isPending || unfavoriteMutation.isPending}
                >
                    <GoHeartFill fontSize={16} />
                </button>
            </div>

            {/* Card Body */}
            <div className="card-body">
                <div className="learning-info">
                    <h3
                        className="learning-title"
                        onClick={handleNavigate}
                        title={item.title}
                    >
                        {item.title}
                    </h3>
                    <p className="learning-concept">{item.concept || "No description provided for this course."}</p>

                    <div className="learning-meta">
                        <span className="meta-item level">
                            <FaGraduationCap />
                            <span>{levelLabel}</span>
                        </span>
                        {item.language_name && (
                            <span className="meta-item language">
                                <FaCode />
                                <span>{item.language_name}</span>
                            </span>
                        )}
                        {item.category_name && (
                            <span className="meta-item category">
                                <MdCategory />
                                <span>{item.category_name}</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Progress Bar & Stats */}
                <div className="learning-progress">
                    <div className="progress-header">
                        <span className="progress-label">Progress</span>
                        <span className="progress-value">
                            {progressPercent === 100 ? 'Completed' : `${progressPercent}%`}
                        </span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className={`progress-fill ${progressPercent === 100 ? 'fill-completed' : ''}`}
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <span className="progress-detail">
                        {completedLessons}/{totalLessons} lesson{totalLessons === 1 ? '' : 's'} finished
                    </span>
                </div>
            </div>

            {/* Card Footer Actions */}
            <div className="card-footer">
                {openSetting ? (
                    <div className="setting-actions">
                        {isArchived ? (
                            <button
                                className="btn_action btn-archived"
                                disabled={withdrawMutation.isPending}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <IoArchive />
                                <span>Archived</span>
                            </button>
                        ) : (
                            <button
                                className="btn_action btn-withdraw"
                                disabled={withdrawMutation.isPending}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setFormConfirm('withdraw')
                                }}
                            >
                                {withdrawMutation.isPending ? (
                                    <LoadingContent scale={0.4} color={"var(--white)"} />
                                ) : (
                                    <>
                                        <IoTrashBin />
                                        <span>Withdraw</span>
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            className="btn-close"
                            title="Close settings"
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpenSetting(false)
                                setFormConfirm(null)
                            }}
                        >
                            <IoClose fontSize={20} />
                        </button>
                    </div>
                ) : (
                    <div className="main-actions">
                        <button
                            className="btn-join"
                            disabled={withdrawMutation.isPending || isNavigating}
                            onClick={handleNavigate}
                        >
                            {isNavigating ? (
                                <LoadingContent scale={0.5} color={"var(--white)"} />
                            ) : (
                                (() => {
                                    if (item.status === 'enrolled') {
                                        return (
                                            <>
                                                <FaPlay fontSize={12} />
                                                <span>Start Learning</span>
                                            </>
                                        )
                                    }
                                    if (item.status === 'completed') {
                                        return (
                                            <>
                                                <IoReload fontSize={16} />
                                                <span>Review Course</span>
                                            </>
                                        )
                                    }
                                    return (
                                        <>
                                            <VscDebugContinue fontSize={17} />
                                            <span>Continue</span>
                                        </>
                                    )
                                })()
                            )}
                        </button>

                        <Link
                            href={`/course/${item.id}`}
                            className="btn-preview"
                            title="View Course Syllabus & Details"
                            aria-label="Course preview"
                        >
                            <BiDetail fontSize={18} />
                        </Link>

                        <button
                            className="btn-settings"
                            disabled={withdrawMutation.isPending}
                            title="Course Settings"
                            aria-label="Course options"
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpenSetting(true)
                            }}
                        >
                            <IoSettingsSharp fontSize={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Withdraw Confirmation Modal */}
            {formConfirm === 'withdraw' && (
                <div className="confirm-modal">
                    {withdrawMutation.isPending ? (
                        <LoadingContent scale={0.8} message="Processing withdrawal..." />
                    ) : (
                        <>
                            <div className="modal-content">
                                <span className="modal-icon">
                                    <IoTrashBin />
                                </span>
                                <h4>Withdraw Course</h4>
                                <p>Are you sure you want to withdraw from <strong>{item.title}</strong>? Your progress will be saved.</p>
                            </div>
                            <div className="modal-actions">
                                <button
                                    className="btn-confirm"
                                    disabled={withdrawMutation.isPending}
                                    onClick={handleWithdrawCourse}
                                >
                                    Withdraw
                                </button>
                                <button
                                    className="btn-cancel"
                                    disabled={withdrawMutation.isPending}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setFormConfirm(null)
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}