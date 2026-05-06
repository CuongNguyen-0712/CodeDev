'use client'
import { useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

import Form from "next/form";

import { IoClose } from "react-icons/io5";
import { HiSparkles, HiPaperAirplane } from "react-icons/hi2";
import { BiMessageDetail } from "react-icons/bi";

import { api } from "@/app/lib/axios";

import { useQuery } from "@/app/router/useQuery";
import { FeedbackSchema } from "@/app/lib/definition";

import { useApp } from "@/app/contexts/appContext";

import { validate } from "@/app/helper/validate";

import { LoadingContent } from "../ui/loading";
import { InputGroup, TextAreaGroup } from "../ui/input";

import useKey from "@/app/hooks/useKey";

export default function Feedback() {
    useKey({ key: 'Escape', param: 'feedback' });

    const { showAlert: alert } = useApp();

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

        try {
            const response = await api.post("post/postFeedback", dataForm);
            if (response.data.success) {
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
                alert(response.status, response.data.message);
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
        }

        const { errors } = validate(FeedbackSchema, nextUpdate);

        setDataForm(nextUpdate);

        setState((prev) => {
            const { [name]: removed, ...rest } = prev.error || {}
            return errors?.[name] ?
                {
                    ...prev,
                    error: { ...prev.error, [name]: errors[name] }
                }
                :
                {
                    ...prev,
                    error: rest
                }
        });
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
                            <>
                                <LoadingContent color="var(--color_white)" scale={0.5} />
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
