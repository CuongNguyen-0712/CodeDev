import { useState, useEffect } from "react";

import PortableTextRenderer from "../../ui/portableTextRenderer";

import { api } from "@/app/lib/axios";

import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

export default function LessonPage({ id, status, submit, isHandling }) {
    const [state, setState] = useState({
        data: null,
        error: null,
        pending: true,
    });

    const fetchLesson = async () => {
        try {
            const response = await api.get(`get/getLesson`, {
                params: {
                    lessonId: id,
                },
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
                        status: response.status,
                        message: response.data.message,
                    },
                });
            }
        } catch (error) {
            setState({
                data: null,
                pending: false,
                error: {
                    status: error.response.status || 500,
                    message: error.response.data.message || "Failed to import lesson data",
                },
            });
        }
    };

    useEffect(() => {
        setState({
            pending: true,
        });

        fetchLesson();
    }, [id]);

    const refetchLesson = () => {
        setState({
            data: null,
            pending: true,
            error: null,
        });

        fetchLesson();
    };

    return state.pending ?

        <LoadingContent message={"Importing data lesson..."} />
        :
        state.error ?
            <ErrorReload data={state.error} refetch={refetchLesson} />
            :
            state.data ?
                <>
                    <div className="lesson_content">
                        <h2>{state.data.title}</h2>
                        <p>{state.data.description}</p>
                        <PortableTextRenderer value={state.data.content} />
                    </div>
                    {
                        status &&
                        <button
                            id="confirm_lesson"
                            onClick={() => submit()}
                            disabled={isHandling}
                        >
                            {
                                isHandling ?
                                    <LoadingContent scale={0.5} color={'var(--color_white)'} />
                                    :
                                    <>
                                        Done
                                    </>
                            }
                        </button>
                    }
                </>
                :
                <p>
                    Lesson data is unavailable, please try reloading the page.
                </p>
}