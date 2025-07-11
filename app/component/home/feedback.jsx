import { useState } from "react";

import Form from "next/form";

import { IoIosSend, IoIosClose, IoIosWarning } from "react-icons/io";
import { BsFillInfoCircleFill } from "react-icons/bs";

import { useQuery } from "@/app/router/router";
import { useAuth } from "@/app/contexts/authContext";
import PostFeedbackService from "@/app/services/postService/feedbackService";

export default function Feedback() {
    const queryNavigate = useQuery();
    const { session } = useAuth();

    const [dataForm, setDataForm] = useState({
        title: "",
        feedback: "",
        email: session.email,
        mark: false
    });

    const initialError = {
        title: {
            status: false,
            message: "Your title is required",
        },
        email: {
            status: false,
            message: "",
        },
        feedback: {
            status: false,
            message: "Your feedback is required",
        },
    };

    const [error, setError] = useState(initialError);
    const [isPending, setPending] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setPending(true);

        const { title, feedback, email } = dataForm;
        let hasError = false;

        const newError = {
            title: {
                status: false,
                message: "",
            },
            feedback: {
                status: false,
                message: "",
            },
            email: {
                status: false,
                message: "",
            },
        };

        if (!title || title.trim().length === 0) {
            newError.title = {
                status: true,
                message: "Title is required",
            };
            hasError = true;
        }

        if (feedback.trim().length === 0 || !feedback) {
            newError.feedback = {
                status: true,
                message: "Feedback is required",
            };
            hasError = true;
        }

        if (email.trim().length === 0 || !email) {
            newError.email = {
                status: true,
                message: "Your email is required",
            };
            hasError = true;
        } else if (!email.includes("@") || !email.includes(".")) {
            newError.email = {
                status: true,
                message: "Your email must include @ and .",
            };
            hasError = true;
        } else if (!email.endsWith(".com")) {
            newError.email = {
                status: true,
                message: "Your email must contain .com",
            };
            hasError = true;
        }

        setError(newError);

        if (hasError) {
            setPending(false);
            return;
        }
        else {
            try {
                const response = await PostFeedbackService(dataForm);
                if (response.status === 200) {
                    setDataForm({
                        title: "",
                        feedback: "",
                        email: session.email,
                    });
                    setError(initialError);
                    setPending(false);
                }
            } catch (error) {
                setPending(false);
            }
        }
    };


    const handleChange = (e) => {
        const { name, value } = e.target;

        setDataForm((prev) => ({
            ...prev,
            [name]: value
        }))

        setError((prev) => ({
            ...prev,
            [name]: {
                status: false,
                message: ""
            }
        }))
    }

    return (
        <Form onSubmit={handleSubmit} id="feedback-form">
            <div className="heading-feedback">
                <h2>Feedback Form</h2>
                <div className="info">
                    <BsFillInfoCircleFill
                        style={{ color: "var(--color_blue)", fontSize: "20px" }}
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
                        disabled={isPending}
                    />
                    {error.title.status && (
                        <span className="error_validation">
                            <IoIosWarning />
                            {error.title.message}
                        </span>
                    )}
                </div>
                <div className="feedback-field">
                    <span className="heading-field">Your email</span>
                    <input
                        type="text"
                        id="email"
                        name="email"
                        value={dataForm.email}
                        onChange={handleChange}
                        placeholder="Your email"
                        disabled={isPending}
                    />
                    {error.email.status && (
                        <span className="error_validation">
                            <IoIosWarning />
                            {error.email.message}
                        </span>
                    )}
                </div>
                <div className="feedback-field">
                    <span className="heading-field">Your feedback</span>
                    <textarea
                        id="feedback"
                        name="feedback"
                        value={dataForm.feedback}
                        onChange={handleChange}
                        placeholder="Write something..."
                        disabled={isPending}
                    ></textarea>
                    {error.feedback.status && (
                        <span className="error_validation">
                            <IoIosWarning /> {error.feedback.message}
                        </span>
                    )}
                </div>
            </div>
            <div className="footer-feedback">
                <button
                    type="button"
                    id="reset"
                    onClick={() => setDataForm((prev) => ({ ...prev, title: "", feedback: "", email: "" }))}
                    disabled={isPending}
                >
                    Reset
                </button>
                <button type="submit" id="send" disabled={isPending} style={isPending ? { cursor: 'not-allowed' } : { cursor: 'pointer' }}>
                    {isPending ? "Sending..." : "Send"}
                    <span>
                        <IoIosSend />
                    </span>
                </button>
            </div>
            <button type="button" onClick={() => queryNavigate(window.location.pathname, { feedback: false })}>
                <IoIosClose />
            </button>
        </Form>
    );
}
