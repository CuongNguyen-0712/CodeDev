'use client'
import { useState, useEffect } from "react"

import { useSearchParams } from "next/navigation"

import { LoadingContent, LoadingRedirect } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import GetStateCourseService from "@/app/services/getService/stateCourseService";

import { useRouterActions } from "@/app/router/router";

import { FaArrowLeft } from "react-icons/fa";

export default function PreviewCourse() {
    const params = useSearchParams();
    const { navigateBack } = useRouterActions()

    const [state, setState] = useState({
        data: null,
        error: null,
        handling: false,
        pending: true,
    })

    const fetchCourseData = async () => {
        if (!params.get('id')) {
            setState((prev) => ({
                ...prev,
                error: {
                    status: 400,
                    message: "Missing somthing, try again"
                },
                pending: false,
            }))
        }

        try {
            const course_id = params.get('id');
            const res = await GetStateCourseService({ course_id: course_id })
            if (res.status === 200) {
                setState((prev) => ({
                    ...prev,
                    data: res.data,
                    pending: false
                }))
            }
            else {
                setState((prev) => ({
                    ...prev,
                    error: {
                        status: res.status || 500,
                        message: res.message || 'Something is wrong'
                    },
                    pending: false
                }))
            }
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    status: 500,
                    message: 'External server error'
                },
                pending: false
            }))
        }
    }

    useEffect(() => {
        fetchCourseData()
    }, [])

    const refetchData = () => {
        setState((prev) => ({
            ...prev,
            error: null,
            pending: true
        }))
        fetchCourseData()
    }

    return (
        <section id="course_preview">
            <div className="header_preview">
                <button
                    type="button"
                    id="preview_back_btn"
                    onClick={() => navigateBack()}
                >
                    <FaArrowLeft fontSize={16} />
                </button>
            </div>
            {
                state.pending ?
                    <LoadingContent />
                    :
                    state.error ?
                        <ErrorReload
                            data={state.error || { status: 500, message: "Something is wrong" }}
                            refetch={refetchData}
                        />
                        :
                        <div className="body_preview">
                            <div>

                            </div>
                            <img src={state.data.image || '/image/static/logo.svg'} alt="course_logo" />
                            <h2>{state.data.title || "..."}</h2>
                        </div>
            }
            <div className="footer_preview">
                <button id="join_course_btn">
                    Join course
                </button>
            </div>
        </section>
    )
}