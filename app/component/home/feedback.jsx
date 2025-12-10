'use client'
import { useState, useEffect } from "react";

import Form from "next/form";

import { IoIosSend, IoIosClose, IoIosWarning } from "react-icons/io";
import { BsFillInfoCircleFill } from "react-icons/bs";

import PostFeedbackService from "@/app/services/postService/feedbackService";

import { useQuery } from "@/app/router/router";
import { useAuth } from "@/app/contexts/authContext";
import { FeedbackDefinition } from "@/app/lib/definition";
import { LoadingContent } from "../ui/loading";
import AlertPush from "../ui/alert";

import useKey from "@/app/hooks/useKey";

export default function Feedback() {
    const queryNavigate = useQuery();
    const { session } = useAuth();

    useKey({ key: 'Escape', param: 'feedback' });

    const [state, setState] = useState({
        error: null,
        handling: false,
    })

    const [dataForm, setDataForm] = useState({
        title: "",
        feedback: "",
    });

    const [alert, setAlert] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (state.handling) return;

        setState((prev) => ({
            ...prev,
            handling: true,
        }));

        if (!FeedbackDefinition(dataForm).success) {
            setState((prev) => ({
                ...prev,
                handling: false,
                error: FeedbackDefinition(dataForm).errors,
            }));
            return;
        }

        try {
            const res = await PostFeedbackService(dataForm);
            if (res.status === 200) {
                setAlert({
                    status: 200,
                    message: "Thank you for your contribution!",
                });
                setDataForm((prev) => ({
                    ...prev,
                    title: "",
                    feedback: "",
                }));
                setState((prev) => ({
                    ...prev,
                    handling: false,
                }));
            }
            else {
                setAlert({
                    status: res.status,
                    message: res.message
                });
                setState((prev) => ({
                    ...prev,
                    handling: false,
                }));
            }
        } catch (err) {
            setAlert({
                status: err.status || 500,
                message: err.message
            });
            setState((prev) => ({
                ...prev,
                handling: false,
            }));
        }
    }


    const handleChange = (e) => {
        const { name, value } = e.target;

        setDataForm((prev) => ({
            ...prev,
            [name]: value
        }));

        setState((prev) => ({
            ...prev,
            error: Object.fromEntries(
                Object.entries(prev.error || {}).filter(([key, _]) => key !== name)
            )
        }))
    }

    useEffect(() => {
        setAlert(null);
    }, [alert]);

    return (
        <Form onSubmit={handleSubmit} id="feedback-form">
            <div className="heading-feedback">
                <h2>Feedback</h2>
                <div className="info">
                    <BsFillInfoCircleFill
                        style={{
                            color: "var(--color_blue)",
                            fontSize: "20px",
                            flexShrink: '0'
                        }}
                    />
                    <p>Share feedback or ideas on how we can improve CodeDev.</p>
                </div>
            </div>
            <div className="modal-feedback">
                <div className="feedback-field">
                    <span className="heading-field">Title of your feedback</span>
                    <input
                        type="text"
                        id="title"
                        name="title"
                        value={dataForm.title}
                        onChange={handleChange}
                        placeholder="Your title"
                        disabled={state.handling}
                    />
                    {
                        (state.error && state.error.title) &&
                        <span className="error_validation">
                            <IoIosWarning />
                            {state.error.title}
                        </span>
                    }
                </div>
                <div className="feedback-field">
                    <span className="heading-field">Your feedback</span>
                    <textarea
                        id="feedback"
                        name="feedback"
                        value={dataForm.feedback}
                        onChange={handleChange}
                        placeholder="Write something..."
                        disabled={state.handling}
                    ></textarea>
                    {
                        (state.error && state.error.feedback) &&
                        <span className="error_validation">
                            <IoIosWarning />
                            {state.error.feedback}
                        </span>
                    }
                </div>
            </div>
            <div className="footer-feedback">
                <button
                    type="button"
                    id="reset"
                    onClick={() => setDataForm((prev) => ({ ...prev, title: "", feedback: "" }))}
                    disabled={state.handling}
                >
                    Reset
                </button>
                <button type="submit" id="send" disabled={state.handling} style={state.handling ? { cursor: 'not-allowed' } : { cursor: 'pointer' }}>
                    {state.handling ?
                        <>
                            Sending...
                            <span style={{ background: "var(--color_blue)" }}>
                                <LoadingContent color="var(--color_white)" scale={0.8} />
                            </span>
                        </>
                        :
                        <>
                            Send
                            <span>
                                <IoIosSend />
                            </span>
                        </>
                    }
                </button>
            </div>
            <button type="button" onClick={() => queryNavigate(window.location.pathname, { feedback: false })}>
                <IoIosClose />
            </button>
            <AlertPush status={alert?.status} message={alert?.message} />
        </Form>
    );
}
