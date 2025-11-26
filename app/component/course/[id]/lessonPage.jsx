import { useState, useEffect } from "react";

import PortableTextRenderer from "../../ui/portableTextRenderer";

import getLessonService from "@/app/services/getService/lessonService";

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
            const res = await getLessonService(id);
            if (res.status === 200) {
                setState({
                    data: res.data,
                    pending: false,
                    error: null,
                });
            } else {
                setState({
                    data: null,
                    pending: false,
                    error: {
                        status: res.status,
                        message: res.message,
                    },
                });
            }
        } catch (error) {
            setState({
                data: null,
                pending: false,
                error: {
                    status: 500,
                    message: "Failed to import lesson data",
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
                    <h2>{state.data.title}</h2>
                    <p>{state.data.description}</p>
                    <PortableTextRenderer value={state.data.content} />
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