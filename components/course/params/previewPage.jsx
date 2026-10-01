'use client'
import Link from "next/link";

import { ErrorReload } from "../../ui/error";
import { LoadingContent } from "../../ui/loading";

import FooterPreview from "./footerPreview";

import { useApp } from "@/contexts/appContext";

import { useQuery } from "@tanstack/react-query";
import { courseQueries } from "@/queries/course.query";
import { useCourseFavorite, useCourseUnfavorite } from "@/mutations/course.mutation";

import CommentPage from "./commentPage";

import { levelMapping } from "@/constants/constants";

import { FaStar, FaGraduationCap, FaPlayCircle, FaCode, FaFileAlt } from "react-icons/fa";
import { IoHeart } from "react-icons/io5";
import { MdPlayLesson, MdPerson, MdLanguage, MdCategory } from "react-icons/md";
import { LuAlarmClock } from "react-icons/lu";
import { PiStudent } from "react-icons/pi";
import { HiChevronRight } from "react-icons/hi2";

import "@/styles/course/[id]/preview.css";

export default function PreviewPage({ params } = {}) {
    const { data, isLoading, error, refetch } = useQuery(courseQueries.details(params.id));

    const useFavorite = useCourseFavorite();
    const useUnfavorite = useCourseUnfavorite();

    const { showAlert: alert } = useApp();

    const handleSubmitFavorite = async () => {
        try {
            if (data?.is_favorite) {
                await useUnfavorite.mutateAsync({ courseId: params.id });
            } else {
                await useFavorite.mutateAsync({ courseId: params.id });
            }
        } catch (err) {
            alert(500, err?.message || "An unexpected error occurred, please try again later");
        }
    };

    const getLessonIcon = (type) => {
        const lower = String(type || '').toLowerCase();
        if (lower.includes('code') || lower.includes('exercise')) return <FaCode className="lesson-icon" />;
        if (lower.includes('quiz') || lower.includes('reading') || lower.includes('article')) return <FaFileAlt className="lesson-icon" />;
        return <FaPlayCircle className="lesson-icon" />;
    };

    return (
        <section id="course-preview">
            {/* Top Breadcrumb */}
            <div className="preview-breadcrumb-wrapper">
                <nav className="course-breadcrumb" aria-label="Breadcrumb">
                    <Link href="/course" className="breadcrumb-link">
                        Courses
                    </Link>
                    <HiChevronRight className="breadcrumb-separator" />
                    <span className="breadcrumb-current">
                        {data?.title || 'Course Details'}
                    </span>
                </nav>
            </div>

            <section className="preview-content">
                <div className="preview-main">
                    {/* Hero Section */}
                    <div className="course-hero">
                        {isLoading ? (
                            <div className="hero-loading">
                                <LoadingContent />
                            </div>
                        ) : error ? (
                            <ErrorReload
                                data={error || { status: 500, message: "An unexpected error occurred, try again later" }}
                                refetch={() => refetch()}
                            />
                        ) : data ? (
                            <>
                                <div className="image_preview">
                                    <img
                                        src={data.image || '/image/static/no_image.png'}
                                        alt={data.title}
                                        className="preview-image"
                                        loading="lazy"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = '/image/static/no_image.png';
                                        }}
                                    />
                                </div>

                                <div className="hero-header">
                                    {data.language_logo && (
                                        <div className="course-logo-wrapper">
                                            <img
                                                src={data.language_logo}
                                                alt={data.language_name || 'Language'}
                                                className="course-logo"
                                                height={56}
                                                width={56}
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                        </div>
                                    )}

                                    <div className="hero-info">
                                        <h1 className="course-title">{data.title}</h1>

                                        <div className="course-badges">
                                            {data.level && (
                                                <span
                                                    className="course-badge level-badge"
                                                    style={{
                                                        color: levelMapping?.[data.level]?.color,
                                                        background: levelMapping?.[data.level]?.bg
                                                    }}
                                                >
                                                    {levelMapping?.[data.level]?.label || data.level}
                                                </span>
                                            )}

                                            <button
                                                type="button"
                                                className={`course-badge favorite-badge ${data.is_favorite ? 'favorited' : ''}`}
                                                onClick={handleSubmitFavorite}
                                                disabled={useFavorite.isPending || useUnfavorite.isPending}
                                                title={data.is_favorite ? "Remove from favorites" : "Add to favorites"}
                                            >
                                                <IoHeart fontSize={18} color={data.is_favorite ? 'var(--rose-500)' : 'var(--gray-400)'} />
                                                <span>{data.is_favorite ? 'Favorited' : 'Favorite'}</span>
                                            </button>

                                            <div className="rating-section" title={`Rated ${data.rating || 0} out of 5`}>
                                                <span className="rating-number">{Number(data.rating || 0).toFixed(1)}</span>
                                                <div className="rating-stars">
                                                    {[1, 2, 3, 4, 5].map((star) => (
                                                        <FaStar
                                                            key={star}
                                                            color={star <= Math.round(Number(data.rating || 0)) ? "var(--color-warning)" : "var(--gray-300)"}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {data.concept && (
                                    <div className="course-concept">
                                        <p>{data.concept}</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="error-text">Course details could not be loaded. Please try again.</p>
                        )}
                    </div>

                    {/* Course Details & Stats */}
                    <div className="course-details">
                        <div className="detail-card">
                            <h3 className="detail-heading">About This Course</h3>
                            <p className="detail-text">{data?.description || 'No detailed description provided for this course.'}</p>

                            <div className="detail-meta">
                                {data?.instructor && (
                                    <span className="detail-tag instructor" title="Instructor">
                                        <MdPerson className="meta-icon" />
                                        <span className="meta-text">{data.instructor}</span>
                                    </span>
                                )}
                                {data?.category_name && (
                                    <span className="detail-tag category" title="Category">
                                        <MdCategory className="meta-icon" />
                                        <span className="meta-text">{data.category_name}</span>
                                    </span>
                                )}
                                {data?.language_name && (
                                    <span className="detail-tag language" title="Programming Language">
                                        <MdLanguage className="meta-icon" />
                                        <span className="meta-text">{data.language_name}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-icon-wrapper lessons">
                                    <MdPlayLesson className="stat-icon lessons" />
                                </div>
                                <div className="stat-info">
                                    <span className="stat-label">Total Lessons</span>
                                    <strong className="stat-value">{data?.lessons ?? 0}</strong>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon-wrapper duration">
                                    <LuAlarmClock className="stat-icon duration" />
                                </div>
                                <div className="stat-info">
                                    <span className="stat-label">Duration</span>
                                    <strong className="stat-value">{data?.duration ?? 0} min</strong>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon-wrapper students">
                                    <PiStudent className="stat-icon students" />
                                </div>
                                <div className="stat-info">
                                    <span className="stat-label">Students</span>
                                    <strong className="stat-value">{data?.students ?? 0}</strong>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Curriculum Section */}
                    <div className="curriculum-section">
                        <div className="section-title">
                            <div className="section-title-icon">
                                <FaGraduationCap fontSize={24} />
                            </div>
                            <div className="title-text">
                                <h4>Course Curriculum</h4>
                                <p>
                                    {data?.modules?.length || 0} modules with structured lessons to guide your progress.
                                </p>
                            </div>
                        </div>

                        <div className="modules-list">
                            {isLoading ? (
                                <div className="modules-loading">
                                    <LoadingContent />
                                </div>
                            ) : data?.modules && data.modules.length > 0 ? (
                                data.modules.map((item, index) => (
                                    <div key={index} className="module-card">
                                        <div className="module-header">
                                            <span className="chapter-badge">Chapter {index + 1}</span>
                                            <h3 className="module-title">{item.title}</h3>
                                            <span className="module-lessons-count">
                                                {item.lessons?.length || 0} {item.lessons?.length === 1 ? 'lesson' : 'lessons'}
                                            </span>
                                        </div>

                                        <div className="lessons-list">
                                            {item.lessons?.map((child, idx) => (
                                                <div key={idx} className="lesson-item">
                                                    {getLessonIcon(child.content_type)}
                                                    <span className="lesson-name">
                                                        <span className="lesson-index">{index + 1}.{idx + 1}</span> {child.title}
                                                    </span>
                                                    {child.content_type && (
                                                        <span className={`lesson-type ${String(child.content_type).toLowerCase()}`}>
                                                            {child.content_type}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="empty-modules">
                                    <p>No curriculum modules have been published for this course yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Comments Sidebar */}
                <CommentPage courseId={params.id} />
            </section>

            {/* Bottom Action Bar */}
            <FooterPreview
                courseId={params.id}
                cost={data?.cost ?? 0}
                status={data?.status ?? 'not_enrolled'}
                loading={isLoading}
            />
        </section>
    );
}