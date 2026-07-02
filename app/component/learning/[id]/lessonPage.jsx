import { useState, useEffect } from "react";

import PortableTextRenderer from "../../ui/portableTextRenderer";

import { api } from "@/app/lib/axios";

import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

export default function LessonPage({ id, status, submit, handling }) {
    const [state, setState] = useState({
        data: null,
        error: null,
        pending: true,
    });

    const fetchLesson = async () => {

        try {
            const response = await api.get(`get/getLesson`, {
                params: { lessonId: id },
            });
            if (response.data.success) {
                setState({
                    data: response.data.data,
                    pending: false,
                    error: null,
                });
            } else {
                setState({
                    data: null,
                    pending: false,
                    error: {
                        status: response.status || 500,
                        message: response.data?.message || "Failed to load lesson",
                    },
                });
            }
        } catch (error) {
            setState({
                data: null,
                pending: false,
                error: {
                    status: error.response?.status || 500,
                    message: error.response?.data?.message || "Failed to load lesson",
                },
            });
        }
    };

    useEffect(() => {
        if (!id) return;
        fetchLesson();
    }, [id]);

    const refetchLesson = () => {
        setState({ data: null, pending: true, error: null });
        fetchLesson();
    };

    if (state.pending) return <LoadingContent message="Loading lesson..." />;
    if (state.error) return <ErrorReload data={state.error} refetch={refetchLesson} />;
    if (state.data)
        return (
            <>
                <div className="lesson_container">
                    <header className="lesson_header">
                        <h1 className="lesson_main_title">{state.data.title}</h1>
                        {state.data.description && (
                            <div className="lesson_description_box">
                                <p className="lesson_description_text">{state.data.description}</p>
                            </div>
                        )}
                    </header>

                    <main className="lesson_content_area">
                        <PortableTextRenderer value={state.data.content} />
                    </main>

                    {status &&
                        <footer className="lesson_footer">
                            <button
                                id="confirm_lesson"
                                onClick={submit}
                                disabled={handling}
                            >
                                {handling ? (
                                    <LoadingContent scale={0.5} color={'var(--color_white)'} />
                                ) : (
                                    "Mark as Done"
                                )}
                            </button>
                        </footer>
                    }
                </div>
            </>
        );

    return <p>Lesson data is unavailable, please try reloading the page.</p>;
}