'use client'
import { useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

import Form from "next/form";

import { IoClose } from "react-icons/io5";
import { HiSparkles, HiPaperAirplane } from "react-icons/hi2";
import { BiMessageDetail } from "react-icons/bi";
import { MdWarning } from "react-icons/md";

import PostFeedbackService from "@/app/services/postService/feedbackService";

import { useQuery } from "@/app/router/router";
import { FeedbackDefinition } from "@/app/lib/definition";
import { LoadingContent } from "../ui/loading";

import useKey from "@/app/hooks/useKey";

export default function Feedback({ alert }) {
    useKey({ key: 'Escape', param: 'feedback' });

    const queryNavigate = useQuery();
    const params = useSearchParams();
    const pathname = usePathname();
    const feedback = params.get('feedback');

    const [state, setState] = useState({
        error: null,
        handling: false,
    });

    const [dataForm, setDataForm] = useState({
        title: "",
        feedback: "",
    });

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
                alert(200, "Thank you for your contribution!");
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
                alert(res.status, res.message);
                setState((prev) => ({
                    ...prev,
                    handling: false,
                }));
            }
        } catch (err) {
            alert(500, err.message || "An error occurred while submitting feedback");
            setState((prev) => ({
                ...prev,
                handling: false,
            }));
        }
    };

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
        }));
    };

    const handleClose = () => queryNavigate(pathname, { feedback: null });

    return feedback && (
        <div className="feedback-overlay">
            <Form onSubmit={handleSubmit} className="feedback-modal">
                {/* Close Button */}
                <button type="button" className="btn-close" onClick={handleClose}>
                    <IoClose />
                </button>

                {/* Modal Header */}
                <div className="feedback-header">
                    <div className="header-icon">
                        <BiMessageDetail />
                    </div>
                    <h2>Send Feedback</h2>
                    <p>Share your thoughts and help us improve CodeDev</p>
                </div>

                {/* Info Banner */}
                <div className="feedback-info">
                    <HiSparkles />
                    <span>Your feedback helps us build a better experience for everyone.</span>
                </div>

                {/* Form Fields */}
                <div className="feedback-body">
                    <div className="form-field">
                        <label htmlFor="title">Title</label>
                        <input
                            type="text"
                            id="title"
                            name="title"
                            value={dataForm.title}
                            onChange={handleChange}
                            placeholder="Brief summary of your feedback"
                            disabled={state.handling}
                        />
                        {state.error?.title && (
                            <span className="field-error">
                                <MdWarning />
                                {state.error.title}
                            </span>
                        )}
                    </div>

                    <div className="form-field">
                        <label htmlFor="feedback">Your Feedback</label>
                        <textarea
                            id="feedback"
                            name="feedback"
                            value={dataForm.feedback}
                            onChange={handleChange}
                            placeholder="Tell us what's on your mind..."
                            disabled={state.handling}
                        />
                        {state.error?.feedback && (
                            <span className="field-error">
                                <MdWarning />
                                {state.error.feedback}
                            </span>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="feedback-footer">
                    <button
                        type="button"
                        className="btn-reset"
                        onClick={() => setDataForm({ title: "", feedback: "" })}
                        disabled={state.handling}
                    >
                        Clear
                    </button>
                    <button
                        type="submit"
                        className="btn-submit"
                        disabled={state.handling}
                    >
                        {state.handling ? (
                            <>
                                <LoadingContent color="var(--color_white)" scale={0.5} />
                                <span>Sending...</span>
                            </>
                        ) : (
                            <>
                                <HiPaperAirplane />
                                <span>Send Feedback</span>
                            </>
                        )}
                    </button>
                </div>
            </Form>
        </div>
    );
}
