'use client';

import { useState, useCallback } from "react";
import { submitChallengeAction } from "@/actions/course.actions";
import { useApp } from "@/contexts/appContext";
import { LoadingContent } from "../../ui/loading";

import { FaCheck, FaXmark, FaRotateRight, FaTrophy, FaStar } from "react-icons/fa6";
import { HiSparkles } from "react-icons/hi2";
import { MdOutlineQuiz, MdLightbulbOutline } from "react-icons/md";

import "@/styles/learning/[id]/challenge.css";

export default function ChallengeSection({ challenges = [], onChallengeCompleted }) {
    const { showAlert: alert } = useApp();

    const [activeTab, setActiveTab] = useState(0);
    // answers is an object: { [questionId]: optionId | [optionIds] }
    const [answers, setAnswers] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    // submissionResults is an object: { [challengeId]: { earnedPoints, totalPoints, passed, results: { [qId]: { isCorrect, explanation, correctOptionIds } } } }
    const [submissionResults, setSubmissionResults] = useState({});

    if (!challenges || challenges.length === 0) {
        return null;
    }

    const currentChallenge = challenges[activeTab] || challenges[0];
    const challengeResult = submissionResults[currentChallenge.id];
    const isSubmitted = Boolean(challengeResult);

    const questions = currentChallenge.questions || [];
    const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);

    const handleSelectOption = (question, optionId) => {
        if (isSubmitted) return;

        const qId = question.id;
        const isMultiple = question.type === 'multiple_choice';

        if (isMultiple) {
            setAnswers(prev => {
                const current = Array.isArray(prev[qId]) ? prev[qId] : [];
                const updated = current.includes(optionId)
                    ? current.filter(id => id !== optionId)
                    : [...current, optionId];
                return { ...prev, [qId]: updated };
            });
        } else {
            setAnswers(prev => ({
                ...prev,
                [qId]: optionId,
            }));
        }
    };

    const isOptionSelected = (qId, optId, type) => {
        const selected = answers[qId];
        if (type === 'multiple_choice') {
            return Array.isArray(selected) && selected.includes(optId);
        }
        return selected === optId;
    };

    const canSubmit = questions.every(q => {
        const val = answers[q.id];
        if (q.type === 'multiple_choice') {
            return Array.isArray(val) && val.length > 0;
        }
        return val !== undefined && val !== null;
    });

    const handleSubmitQuiz = async () => {
        if (!canSubmit || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const res = await submitChallengeAction({
                challengeId: currentChallenge.id,
                answers,
            });

            if (res) {
                setSubmissionResults(prev => ({
                    ...prev,
                    [currentChallenge.id]: res,
                }));

                if (res.passed) {
                    alert(200, `Challenge passed! You earned ${res.earnedPoints}/${res.totalPoints} points.`);
                    onChallengeCompleted?.(currentChallenge.id);
                } else {
                    alert(400, `Review the answers and try again. You scored ${res.earnedPoints}/${res.totalPoints} points.`);
                }
            }
        } catch (error) {
            console.error("Challenge submit failed:", error);
            alert(500, "Failed to submit challenge. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRetryQuiz = () => {
        setAnswers(prev => {
            const next = { ...prev };
            questions.forEach(q => delete next[q.id]);
            return next;
        });
        setSubmissionResults(prev => {
            const next = { ...prev };
            delete next[currentChallenge.id];
            return next;
        });
    };

    return (
        <section className="challenge_section_wrapper" aria-label="Lesson Challenges">
            <div className="challenge_card">
                {/* Header */}
                <div className="challenge_header">
                    <div className="challenge_top_bar">
                        <div className="challenge_brand">
                            <div className="challenge_icon_box">
                                <MdOutlineQuiz fontSize={20} />
                            </div>
                            <span className="challenge_label">Interactive Knowledge Check</span>
                        </div>

                        <div className="challenge_badges">
                            <span className={`badge_diff ${currentChallenge.difficulty || 'easy'}`}>
                                {currentChallenge.difficulty || 'Easy'}
                            </span>
                            <span className="badge_points">
                                <FaStar fontSize={11} style={{ marginRight: 4 }} />
                                {totalPoints} Points
                            </span>
                        </div>
                    </div>

                    <h2 className="challenge_title">{currentChallenge.title}</h2>
                    {currentChallenge.description && (
                        <p className="challenge_desc">{currentChallenge.description}</p>
                    )}
                </div>

                {/* Question List */}
                <div className="challenge_body">
                    {questions.map((question, qIdx) => {
                        const qResult = challengeResult?.results?.[question.id];
                        const isCorrect = qResult?.isCorrect;
                        const correctOptions = qResult?.correctOptionIds || [];

                        return (
                            <div key={question.id || qIdx} className="question_card">
                                <div className="question_header">
                                    <span className="question_index_pill">
                                        Question {qIdx + 1} of {questions.length}
                                    </span>
                                    <span className="question_points_tag">
                                        +{question.points || 10} pts
                                    </span>
                                </div>

                                <div className="question_content">
                                    {question.content}
                                </div>

                                <div className="question_type_hint">
                                    {question.type === 'multiple_choice'
                                        ? 'Select all options that apply'
                                        : 'Select the best single answer'}
                                </div>

                                {/* Options */}
                                <div className="options_grid" role="group" aria-label={`Question ${qIdx + 1} options`}>
                                    {(question.options || []).map((option) => {
                                        const selected = isOptionSelected(question.id, option.id, question.type);

                                        let resultClass = '';
                                        let statusBadge = null;

                                        if (isSubmitted) {
                                            const wasCorrect = correctOptions.includes(option.id);
                                            if (selected && wasCorrect) {
                                                resultClass = 'result_correct';
                                                statusBadge = <span className="option_badge_status badge_opt_correct">Correct</span>;
                                            } else if (selected && !wasCorrect) {
                                                resultClass = 'result_incorrect';
                                                statusBadge = <span className="option_badge_status badge_opt_wrong">Incorrect</span>;
                                            } else if (!selected && wasCorrect) {
                                                resultClass = 'result_missed';
                                                statusBadge = <span className="option_badge_status badge_opt_answer">Correct Answer</span>;
                                            }
                                        }

                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                className={`option_btn ${selected ? 'selected' : ''} ${resultClass}`}
                                                onClick={() => handleSelectOption(question, option.id)}
                                                disabled={isSubmitted || isSubmitting}
                                            >
                                                <span className={`option_indicator ${question.type === 'multiple_choice' ? 'checkbox' : ''}`}>
                                                    {isSubmitted ? (
                                                        correctOptions.includes(option.id) ? (
                                                            <FaCheck />
                                                        ) : selected ? (
                                                            <FaXmark />
                                                        ) : null
                                                    ) : selected ? (
                                                        <FaCheck />
                                                    ) : null}
                                                </span>
                                                <span className="option_text">{option.content}</span>
                                                {statusBadge}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Explanation on submission */}
                                {isSubmitted && (question.explanation || qResult?.explanation) && (
                                    <div className="explanation_card">
                                        <div className="explanation_title">
                                            <MdLightbulbOutline fontSize={16} />
                                            <span>Explanation</span>
                                        </div>
                                        <div className="explanation_body">
                                            {qResult?.explanation || question.explanation}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer Action Bar */}
                <div className="challenge_footer">
                    {isSubmitted ? (
                        <>
                            <div className={`challenge_result_banner ${challengeResult.passed ? 'passed' : 'failed'}`}>
                                <div className="result_icon">
                                    {challengeResult.passed ? '🎉' : '💡'}
                                </div>
                                <div className="result_texts">
                                    <span className="result_title">
                                        {challengeResult.passed ? 'Challenge Completed!' : 'Keep Learning!'}
                                    </span>
                                    <span className="result_subtitle">
                                        Score: {challengeResult.earnedPoints} / {challengeResult.totalPoints} points ({challengeResult.percentage}%)
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="btn_retry_quiz"
                                onClick={handleRetryQuiz}
                            >
                                <FaRotateRight fontSize={13} />
                                <span>Try Again</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="challenge_progress_hint">
                                <span style={{ fontSize: 13.5, color: 'var(--gray-600)' }}>
                                    {Object.keys(answers).length}/{questions.length} questions answered
                                </span>
                            </div>

                            <button
                                type="button"
                                className="btn_submit_quiz"
                                onClick={handleSubmitQuiz}
                                disabled={!canSubmit || isSubmitting}
                            >
                                {isSubmitting ? (
                                    <LoadingContent scale={0.4} color="var(--white)" />
                                ) : (
                                    <>
                                        <HiSparkles fontSize={16} />
                                        <span>Check Answers</span>
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}
