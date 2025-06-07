import { useState } from "react";

import { IoIosSend, IoIosClose, IoIosWarning } from "react-icons/io";
import { BsFillInfoCircleFill } from "react-icons/bs";

import Form from "next/form";
import { useQuery } from "@/app/router/router";
import PostFeedbackService from "@/app/services/postService/feedbackService";

export default function Feedback() {
    const queryNavigate = useQuery();

    const [dataForm, setDataForm] = useState({
        title: "",
        feedback: "",
        email: "nguyencuong0712@gmail.com",
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
                        email: "nguyenquoccuong07122004@gmail.com",
                    });
                    setError(initialError);
                    setPending(false);
                }
            } catch (error) {
                setPending(false);
            }
        }
    };

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
                        onChange={(e) =>
                            setDataForm({ ...dataForm, title: e.target.value })
                        }
                        placeholder="Your title"
                        disabled={isPending}
                    />
                    {error.title.status && (
                        <span className="error">
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
                        onChange={(e) =>
                            setDataForm({ ...dataForm, email: e.target.value })
                        }
                        placeholder="Your email"
                        disabled={isPending}
                    />
                    {error.email.status && (
                        <span className="error">
                            <IoIosWarning />
                            {error.email.message}
                        </span>
                    )}
                </div>
                <div className="feedback-field">
                    <span className="heading-field">Your feedback</span>
                    <textarea
                        id="feedback"
                        name="feebback"
                        value={dataForm.feedback}
                        onChange={(e) =>
                            setDataForm({ ...dataForm, feedback: e.target.value })
                        }
                        placeholder="Write something..."
                        disabled={isPending}
                    ></textarea>
                    {error.feedback.status && (
                        <span className="error">
                            <IoIosWarning /> {error.feedback.message}
                        </span>
                    )}
                </div>
            </div>
            <div className="footer-feedback">
                <button
                    type="button"
                    id="reset"
                    onClick={() => setDataForm({ title: "", feedback: "", email: "" })}
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
