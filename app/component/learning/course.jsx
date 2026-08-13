import { useState, useTransition } from "react"

import { useRouterActions } from "@/app/router/useRouterActions"

import { useCourseWithdraw, useCourseFavorite, useCourseUnfavorite } from "@/app/mutation/course.mutation"

import { LoadingContent } from "../ui/loading"

import { levelMapping } from "@/app/utils/constants"

import Link from "next/link"

import { useApp } from "@/app/contexts/appContext"

import { FaGraduationCap, FaCode, FaPlay } from "react-icons/fa"
import { MdCategory } from "react-icons/md"
import { GoHeartFill } from "react-icons/go"
import { IoSettingsSharp, IoTrashBin, IoClose, IoReload, IoArchive } from "react-icons/io5"
import { VscDebugContinue } from "react-icons/vsc"
import { BiDetail } from "react-icons/bi"

import "@/app/style/learning/course.css"

export default function LearningCourse({ item }) {
    const [openSetting, setOpenSetting] = useState(false)
    const [formConfirm, setFormConfirm] = useState(null)
    const [isNavigating, startTransition] = useTransition()

    const { showAlert: alert } = useApp()
    const { navigate } = useRouterActions()

    const withdrawMutation = useCourseWithdraw()
    const favoriteMutation = useCourseFavorite()
    const unfavoriteMutation = useCourseUnfavorite()

    const progressPercent = item.lessons > 0
        ? ((item.progress ?? 0) / item.lessons * 100).toFixed(0)
        : 0;

    const isArchived = item.status !== 'enrolled'
    const isFavorited = item.is_favorite ?? false

    const handleWithdrawCourse = async (e) => {
        e.preventDefault();

        try {
            await withdrawMutation.mutateAsync(item.id)

            alert(200, `Successfully withdrew the course: ${item.title}.`)
        }
        catch (error) {
            alert(500, "An error occurred while withdrawing the course.");
        }
    }

    const handleFavoriteCourse = async (e) => {
        e.preventDefault();

        try {
            if (isFavorited) {
                await unfavoriteMutation.mutateAsync({ courseId: item.id })
            } else {
                await favoriteMutation.mutateAsync({ courseId: item.id })
            }
        }
        catch (error) {
            alert(500, "An error occurred while updating favorite status.");
        }
    }

    const handleNavigate = () => {
        if (item.lessons === 0) {
            alert(500, "This course has no lessons available.")
            return
        }

        startTransition(() => {
            navigate({ path: `/learning/${item.id}` })
        })
    }

    return (
        <div className="learning-card">
            <div className="card-header">
                <div className="learning-icon">
                    <img
                        src={item.language_logo || '/image/static/no_image.png'}
                        alt={item.language_name || 'No Image'}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/image/static/no_image.png';
                        }}
                    />
                </div>
                <button
                    className={`bookmark-btn ${isFavorited ? 'active' : ''}`}
                    onClick={handleFavoriteCourse}
                >
                    <GoHeartFill fontSize={16} />
                </button>
            </div>

            {/* Card Body */}
            <div className="card-body">
                <div className="learning-info">
                    <h3 className="learning-title">{item.title}</h3>
                    <p className="learning-concept">{item.concept}</p>

                    <div className="learning-meta">
                        <span className="meta-item level">
                            <FaGraduationCap />
                            {levelMapping[item.level].label || '__'}
                        </span>
                        <span className="meta-item language">
                            <FaCode />
                            {item.language_name || '__'}
                        </span>
                        <span className="meta-item category">
                            <MdCategory />
                            {item.category_name || '__'}
                        </span>
                    </div>
                </div>

                {/* Progress */}
                <div className="learning-progress">
                    <div className="progress-header">
                        <span className="progress-label">Progress</span>
                        <span className="progress-value">{progressPercent == 100 ? 'Completed' : `${progressPercent}%`}</span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <span className="progress-detail">{item.progress}/{item.lessons} lessons</span>
                </div>
            </div>

            <div className="card-footer">
                {openSetting ? (
                    <div className="setting-actions">
                        {
                            isArchived ?
                                <button
                                    className="btn_action btn-archived"
                                    disabled={withdrawMutation.isLoading}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                    }}
                                >
                                    {withdrawMutation.isLoading ? (
                                        <LoadingContent scale={0.4} color={"var(--white)"} />
                                    ) : (
                                        <>
                                            <IoArchive />
                                            Archive
                                        </>
                                    )}
                                </button>
                                :
                                <button
                                    className="btn_action btn-withdraw"
                                    disabled={withdrawMutation.isLoading}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setFormConfirm('withdraw')
                                    }}
                                >
                                    {withdrawMutation.isLoading ? (
                                        <LoadingContent scale={0.4} color={"var(--white)"} />
                                    ) : (
                                        <>
                                            <IoTrashBin />
                                            Withdraw
                                        </>
                                    )}
                                </button>
                        }
                        <button
                            className="btn-close"
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpenSetting(false)
                                setFormConfirm(null)
                            }}
                        >
                            <IoClose />
                        </button>
                    </div>
                ) : (
                    <div className="main-actions">
                        <button
                            className="btn-join"
                            disabled={withdrawMutation.isLoading}
                            onClick={handleNavigate}
                        >
                            {
                                isNavigating ?
                                    <LoadingContent scale={0.5} color={"var(--white)"} />
                                    : (
                                        (() => {
                                            switch (parseInt(progressPercent)) {
                                                case 0:
                                                    return (
                                                        <>
                                                            <FaPlay />
                                                            Start
                                                        </>
                                                    )

                                                case 100:
                                                    return (
                                                        <>
                                                            <IoReload />
                                                            Review
                                                        </>
                                                    )

                                                default:
                                                    return (
                                                        <>
                                                            <VscDebugContinue />
                                                            Continue
                                                        </>
                                                    )
                                            }
                                        })()
                                    )}
                        </button>
                        <Link
                            href={`/course/${item.id}`}
                            className="btn-preview"
                        >
                            <BiDetail />
                        </Link>
                        <button
                            className="btn-settings"
                            disabled={withdrawMutation.isPending}
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpenSetting(true)
                            }}
                        >
                            <IoSettingsSharp />
                        </button>
                    </div>
                )}
            </div>

            {formConfirm === 'withdraw' &&
                <div className="confirm-modal">
                    {withdrawMutation.isPending ? (
                        <LoadingContent scale={0.8} />
                    ) : (
                        <>
                            <div className="modal-content">
                                <span className="modal-icon">
                                    <IoTrashBin />
                                </span>
                                <h4>Withdraw Course</h4>
                                <p>Are you sure you want to withdraw <strong>{item.title}</strong>?</p>
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
            }
        </div>
    )
}