import { useEffect, useRef } from "react";

import PortableTextRenderer from "../../ui/portableTextRenderer";

import { useCourseSubmitLesson } from "@/app/mutation/course.mutation";

import { useApp } from "@/app/contexts/appContext";

import { LoadingContent } from "../../ui/loading";

import { useQuery } from "@tanstack/react-query";
import { courseQueries } from "@/app/query/course.query";

import { ErrorReload } from "../../ui/error";

export function SubmitLessonButton({ lessonId, courseId, isSubmit }) {
    const submitLesson = useCourseSubmitLesson();

    const { showAlert: alert } = useApp();

    const handleSubmit = async () => {
        try {
            await submitLesson.mutateAsync({ lessonId, courseId });

            alert("Lesson submitted successfully!");
        }
        catch (error) {
            alert("Failed to submit lesson. Please try again.");
        }
    }

    return isSubmit &&
        !submitLesson.isSuccess &&
        <button
            id="confirm_lesson"
            onClick={handleSubmit}
            disabled={submitLesson.isPending}
        >
            {submitLesson.isPending ? (
                <LoadingContent scale={0.5} color={'var(--white)'} />
            ) : (
                "Mark as Done"
            )}
        </button>
}

export default function LearningLesson({ lessonId, courseId, isSubmit }) {
    const { data, isLoading, isError, error, refetch } = useQuery(courseQueries.learning(lessonId));

    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [lessonId]);

    if (isError) return <ErrorReload data={error} refetch={refetch} />;
    return (
        <div id="view" ref={scrollRef}>
            <div className="lesson_container">
                <header className="lesson_header">
                    <h1 className="lesson_main_title">{data?.title}</h1>
                    <div className="lesson_description_box">
                        <p className="lesson_description_text">{data?.description}</p>
                    </div>
                </header>

                <div className="portable_text_container">
                    <PortableTextRenderer value={data?.content} />
                </div>

                <footer className="lesson_footer">
                    {
                        !isLoading &&
                        <SubmitLessonButton lessonId={lessonId} courseId={courseId} isSubmit={isSubmit} />
                    }
                </footer>
            </div>
        </div>
    );
}