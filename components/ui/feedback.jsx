'use client';

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Form from "next/form";

import { IoClose } from "react-icons/io5";
import { HiSparkles, HiPaperAirplane } from "react-icons/hi2";
import { BiMessageDetail } from "react-icons/bi";

import { sendFeedbackAction } from "@/actions/feedback.actions";
import { useQueryParams } from "@/router/useQueryParams";
import { FeedbackSchema } from "@/lib/definition";
import { useApp } from "@/contexts/appContext";
import { validate } from "@/lib/validate";

import { LoadingContent } from "./loading";
import { InputGroup, TextAreaGroup } from "./input";
import useKey from "@/hooks/useKey";

import "@/styles/home/feedback.css";

export default function Feedback() {
    useKey({ key: 'Escape', param: 'feedback' });

    const { overlay, setOverlay, showAlert: alert } = useApp();
    const updateQuery = useQueryParams();
    const params = useSearchParams();

    const isFeedbackQuery = params.get('modal') === 'feedback';
    const isOpen = overlay === 'feedback' || isFeedbackQuery;

    const [state, setState] = useState({
        error: null,
        handling: false,
    });

    const [dataForm, setDataForm] = useState({
        title: "",
        feedback: "",
    });

    useEffect(() => {
        if (isFeedbackQuery && overlay !== 'feedback') {
            setOverlay('feedback');
        }
    }, [isFeedbackQuery, overlay, setOverlay]);

    useEffect(() => {
        if (!overlay && isFeedbackQuery) {
            updateQuery({ modal: null });
        }
    }, [overlay, isFeedbackQuery, updateQuery]);

    useEffect(() => {
        return () => {
            if (overlay === 'feedback') {
                setOverlay(null);
            }
        };
    }, [overlay, setOverlay]);

    const handleClose = () => {
        setOverlay(null);
        if (isFeedbackQuery) {
            updateQuery({ modal: null });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const { success, errors } = validate(FeedbackSchema, dataForm);
        if (!success) {
            setState((prev) => ({
                ...prev,
                error: errors,
            }));
            return;
        }

        if (state.handling) return;

        setState((prev) => ({
            ...prev,
            handling: true,
        }));

        try {
            const response = await sendFeedbackAction(dataForm);
            if (response.success) {
                alert(200, "Thank you for your contribution!");
                setDataForm({
                    title: "",
                    feedback: "",
                });
                setState({
                    error: null,
                    handling: false,
                });
                handleClose();
            } else {
                alert(response.status || 500, response.message || "Failed to submit feedback");
                setState((prev) => ({
                    ...prev,
                    handling: false,
                }));
            }
        } catch (err) {
            alert(err.response?.status || 500, err.response?.data?.message || "An error occurred while submitting feedback");
            setState((prev) => ({
                ...prev,
                handling: false,
            }));
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        const nextUpdate = {
            ...dataForm,
            [name]: value,
        };

        const { errors } = validate(FeedbackSchema, nextUpdate);

        setDataForm(nextUpdate);

        setState((prev) => {
            const { [name]: removed, ...rest } = prev.error || {};
            return errors?.[name]
                ? {
                    ...prev,
                    error: { ...prev.error, [name]: errors[name] },
                }
                : {
                    ...prev,
                    error: rest,
                };
        });
    };

    if (!isOpen) return null;

    return (
        <div
            className="feedback-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    handleClose();
                }
            }}
        >
            <Form onSubmit={handleSubmit} className="feedback-modal" onClick={(e) => e.stopPropagation()}>
                {/* Close Button */}
                <button
                    type="button"
                    className="btn-close"
                    onClick={handleClose}
                    aria-label="Close feedback modal"
                >
                    <IoClose />
                </button>

                {/* Modal Header */}
                <div className="feedback-header">
                    <div className="header-icon">
                        <BiMessageDetail />
                    </div>
                    <h2 id="feedback-title">Send Feedback</h2>
                    <p>Share your thoughts and help us improve CodeDev</p>
                </div>

                {/* Info Banner */}
                <div className="feedback-info">
                    <HiSparkles />
                    <span>Your feedback helps us build a better experience for everyone.</span>
                </div>

                {/* Form Fields */}
                <div className="feedback-body">
                    <InputGroup
                        name="title"
                        label="Brief summary of your feedback"
                        type="text"
                        value={dataForm.title}
                        icon={<BiMessageDetail className="icon" />}
                        onChange={handleChange}
                        error={state.error?.title}
                        reset={() => setDataForm((prev) => ({ ...prev, title: "" }))}
                    />

                    <TextAreaGroup
                        name="feedback"
                        label="Describe your feedback in details"
                        value={dataForm.feedback}
                        onChange={handleChange}
                        error={state.error?.feedback}
                        reset={() => setDataForm((prev) => ({ ...prev, feedback: "" }))}
                    />
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
                            <LoadingContent color="var(--white)" scale={0.5} />
                        ) : (
                            <>
                                <HiPaperAirplane />
                                <span>Send</span>
                            </>
                        )}
                    </button>
                </div>
            </Form>
        </div>
    );
}
