import { useEffect, useRef } from "react";
import PortableTextRenderer from "../../ui/portableTextRenderer";
import { useCourseSubmitLesson } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { LoadingContent } from "../../ui/loading";
import { useQuery } from "@tanstack/react-query";
import { courseQueries } from "@/queries/course.query";
import { ErrorReload } from "../../ui/error";

import { FaArrowLeft, FaArrowRight, FaCheck, FaLock } from "react-icons/fa6";
import { FaCheckCircle } from "react-icons/fa";
import { LuBookOpen } from "react-icons/lu";
import ChallengeSection from "./challengeSection";

import "@/styles/learning/[id]/lesson.css"

export function SubmitLessonButton({ lessonId, courseId, onSubmitted }) {
    const submitLesson = useCourseSubmitLesson();
    const { showAlert: alert } = useApp();

    const handleSubmit = async () => {
        try {
            await submitLesson.mutateAsync({ lessonId, courseId });
            alert(200, "Lesson marked as completed! Keep up the great momentum.");
            onSubmitted?.();
        }
        catch (error) {
            console.error("Failed to submit lesson:", error);
            alert(500, "Failed to submit lesson. Please try again.");
        }
    };

    if (submitLesson.isSuccess) {
        return (
            <div className="lesson_completed_badge">
                <FaCheckCircle fontSize={18} />
                <span>Completed</span>
            </div>
        );
    }

    return (
        <button
            id="confirm_lesson"
            onClick={handleSubmit}
            disabled={submitLesson.isPending}
            title="Mark this lesson as completed"
        >
            {submitLesson.isPending ? (
                <LoadingContent scale={0.5} color={'var(--white)'} />
            ) : (
                <>
                    <FaCheck fontSize={14} />
                    <span>Mark as Completed</span>
                </>
            )}
        </button>
    );
}

export default function LearningLesson({
    lessonId,
    courseId,
    isSubmit,
    isLocked = false,
    onSubmitted,
    prevLesson,
    nextLesson,
    isPrevUnlocked = true,
    isNextUnlocked = true,
    onSelectLesson,
    challenges = []
}) {
    const {
        data,
        isLoading,
        isError,
        error,
        refetch
    } = useQuery({
        ...courseQueries.learning(lessonId),
        enabled: Boolean(lessonId && !isLocked),
    });

    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [lessonId]);

    if (!lessonId) {
        return (
            <div id="view" className="empty-lesson-view">
                <div className="empty-lesson-card">
                    <div className="empty-icon-box">
                        <LuBookOpen fontSize={36} />
                    </div>
                    <h3>Select a Lesson</h3>
                    <p>Choose any lesson from the course syllabus to start reading and coding.</p>
                </div>
            </div>
        );
    }

    if (isLocked) {
        return (
            <div id="view" className="empty-lesson-view locked-lesson-view">
                <div className="empty-lesson-card">
                    <div className="empty-icon-box locked-icon-box">
                        <FaLock fontSize={32} />
                    </div>
                    <h3>Lesson Locked</h3>
                    <p>This lesson is currently locked. Please complete the preceding lessons in the course to unlock it.</p>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div id="view" className="error-lesson-view">
                <ErrorReload data={error} refetch={refetch} />
            </div>
        );
    }

    return (
        <div id="view" ref={scrollRef}>
            <div className="lesson_container">
                {isLoading ? (
                    <div className="lesson-loading-body">
                        <LoadingContent message="Loading lesson..." />
                    </div>
                ) : (
                    <>
                        <header className="lesson_header">
                            <h1 className="lesson_main_title">{data?.title}</h1>
                            {data?.description && (
                                <div className="lesson_description_box">
                                    <p className="lesson_description_text">{data.description}</p>
                                </div>
                            )}
                        </header>

                        <div className="portable_text_container">
                            <PortableTextRenderer value={data?.content} />
                        </div>

                        {challenges && challenges.length > 0 && (
                            <ChallengeSection
                                challenges={challenges}
                                onChallengeCompleted={() => onSubmitted?.()}
                            />
                        )}

                        <footer className="lesson_footer">
                            <div className="lesson_action_bar">
                                {isSubmit ? (
                                    <div className="lesson_completed_badge">
                                        <FaCheckCircle fontSize={18} />
                                        <span>Lesson Completed</span>
                                    </div>
                                ) : (
                                    <SubmitLessonButton
                                        lessonId={lessonId}
                                        courseId={courseId}
                                        onSubmitted={onSubmitted}
                                    />
                                )}
                            </div>

                            {/* Lesson Stepper Navigation */}
                            <div className="lesson_stepper_nav">
                                {prevLesson ? (
                                    <button
                                        type="button"
                                        className={`stepper_btn prev_btn ${!isPrevUnlocked ? 'disabled' : ''}`}
                                        onClick={() => isPrevUnlocked && onSelectLesson?.(prevLesson)}
                                        disabled={!isPrevUnlocked}
                                        aria-disabled={!isPrevUnlocked}
                                        title={!isPrevUnlocked ? `Locked: ${prevLesson.title}` : `Previous: ${prevLesson.title}`}
                                    >
                                        {!isPrevUnlocked ? <FaLock fontSize={12} /> : <FaArrowLeft fontSize={13} />}
                                        <div className="stepper_text">
                                            <span className="stepper_sub">
                                                {!isPrevUnlocked ? 'Previous Lesson (Locked)' : 'Previous Lesson'}
                                            </span>
                                            <span className="stepper_title">{prevLesson.title}</span>
                                        </div>
                                    </button>
                                ) : <div className="stepper_placeholder" />}

                                {nextLesson ? (
                                    <button
                                        type="button"
                                        className={`stepper_btn next_btn ${!isNextUnlocked ? 'disabled' : ''}`}
                                        onClick={() => isNextUnlocked && onSelectLesson?.(nextLesson)}
                                        disabled={!isNextUnlocked}
                                        aria-disabled={!isNextUnlocked}
                                        title={!isNextUnlocked ? `Locked: Complete this lesson to unlock "${nextLesson.title}"` : `Next: ${nextLesson.title}`}
                                    >
                                        <div className="stepper_text">
                                            <span className="stepper_sub">
                                                {!isNextUnlocked ? 'Next Lesson (Locked)' : 'Next Lesson'}
                                            </span>
                                            <span className="stepper_title">{nextLesson.title}</span>
                                        </div>
                                        {!isNextUnlocked ? <FaLock fontSize={12} /> : <FaArrowRight fontSize={13} />}
                                    </button>
                                ) : <div className="stepper_placeholder" />}
                            </div>
                        </footer>
                    </>
                )}
            </div>
        </div>
    );
}