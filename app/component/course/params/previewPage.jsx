'use client'
import Link from "next/link";

import { ErrorReload } from "../../ui/error";
import { LoadingContent } from "../../ui/loading";

import FooterPreview from "./footerPreview";

import { useApp } from "@/app/contexts/appContext";

import { useQuery } from "@tanstack/react-query";
import { courseQueries } from "@/app/query/course.query";
import { useCourseFavorite, useCourseUnfavorite } from "@/app/mutation/course.mutation";

import CommentPage from "./commentPage";

import { levelMapping } from "@/app/utils/constants";

import { FaStar, FaGraduationCap, FaPlayCircle } from "react-icons/fa";
import { IoHeart } from "react-icons/io5";
import { MdPlayLesson, MdPerson, MdLanguage, MdCategory } from "react-icons/md";
import { LuAlarmClock } from "react-icons/lu";
import { PiStudent } from "react-icons/pi";

import "@/app/style/course/[id]/preview.css";

export default function PreviewPage({ params } = {}) {
    const { data, isLoading, error, refetch } = useQuery(courseQueries.details(params.id))

    const useFavorite = useCourseFavorite()
    const useUnfavorite = useCourseUnfavorite()

    const { showAlert: alert } = useApp()

    const handleSubmitFavorite = async () => {
        try {
            if (data?.is_favorite) {
                await useUnfavorite.mutateAsync({ courseId: params.id })
            }
            else {
                await useFavorite.mutateAsync({ courseId: params.id })
            }
        }
        catch (error) {
            alert(500, error?.message || "An unexpected error occurred, try again later")
        }
    }

    return (
        <section id="course-preview">
            <section className="preview-content">
                <div className="preview-main">
                    <div className="course-hero">
                        {isLoading ?
                            <LoadingContent />
                            :
                            error ?
                                <ErrorReload
                                    data={error || { status: 500, message: "An unexpected error occurred, try again later" }}
                                    refetch={() => refetch()}
                                />
                                :
                                data ?
                                    <>
                                        <div className="image_preview">
                                            <img
                                                src={data.image || '/image/static/no_image.png'}
                                                alt={data.title}
                                                className="preview-image"
                                                width={800}
                                                height={450}
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                        </div>
                                        <div className="hero-header">
                                            <img
                                                src={data.language_logo || '/image/static/no_image.png'}
                                                alt={data.title}
                                                className="course-logo"
                                                width={100}
                                                height={100}
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                            <div className="hero-info">
                                                <h1 className="course-title">{data.title}</h1>
                                                <div className="course-badges">
                                                    <span
                                                        className="course-badge level-badge"
                                                        style={{
                                                            color: levelMapping?.[data.level]?.color,
                                                            background: levelMapping?.[data.level]?.bg
                                                        }}
                                                    >
                                                        {levelMapping?.[data.level]?.label}
                                                    </span>
                                                    <button className={`course-badge favorite-badge ${data.is_favorite ? 'favorited' : ''}`} onClick={handleSubmitFavorite}>
                                                        <IoHeart fontSize={20} color={data.is_favorite ? 'var(--rose-500)' : 'var(--gray-400)'} />
                                                        Favor
                                                    </button>
                                                </div>
                                                <div className="rating-section">
                                                    {data.rating}
                                                    <div className="rating-stars">
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="course-concept">{data.concept}</p>
                                    </>
                                    :
                                    <p className="error-text">Something is wrong, try again!</p>
                        }
                    </div>

                    <div className="course-details">
                        <div className="detail-card">
                            <p className="detail-text">{data?.description ?? '_'}</p>
                            <div className="detail-meta">
                                <Link href={'#'} className="detail-tag instructor" title='Instructor'>
                                    <MdPerson className="meta-icon" />
                                    <span className="meta-text">{data?.instructor ?? '_'}</span>
                                </Link>
                                <Link href={'#'} className="detail-tag category" title='Category'>
                                    <MdCategory className="meta-icon" />
                                    <span className="meta-text">{data?.category_name ?? '_'}</span>
                                </Link>
                                <Link href={'#'} className="detail-tag language" title='Language'>
                                    <MdLanguage className="meta-icon" />
                                    <span className="meta-text">{data?.language_name ?? '_'}</span>
                                </Link>
                            </div>
                        </div>

                        <div className="stats-grid">
                            <div className="stat-card">
                                <MdPlayLesson className="stat-icon lessons" fontSize={30} />
                                <div className="stat-info">
                                    <span className="stat-label">Lessons</span>
                                    <strong className="stat-value">{data?.lessons ?? 0}</strong>
                                </div>
                            </div>
                            <div className="stat-card">
                                <LuAlarmClock className="stat-icon duration" fontSize={30} />
                                <div className="stat-info">
                                    <span className="stat-label">Duration</span>
                                    <strong className="stat-value">{data?.duration ?? 0} min</strong>
                                </div>
                            </div>
                            <div className="stat-card">
                                <PiStudent className="stat-icon students" fontSize={30} />
                                <div className="stat-info">
                                    <span className="stat-label">Students</span>
                                    <strong className="stat-value">{data?.students ?? 0}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="curriculum-section">
                        <h3 className="section-title">
                            <FaGraduationCap fontSize={25} />
                            Course Curriculum
                        </h3>
                        <div className="modules-list">
                            {
                                isLoading ?
                                    <LoadingContent />
                                    :
                                    data?.modules && data.modules.length > 0 ? (
                                        data.modules.map((item, index) => (
                                            <div key={index} className="module-card">
                                                <div className="module-header">
                                                    <span className="chapter-badge">Chapter {index + 1}</span>
                                                    <h3 className="module-title">{item.title}</h3>
                                                </div>
                                                <div className="lessons-list">
                                                    {item.lessons.map((child, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="lesson-item"
                                                        >
                                                            <FaPlayCircle className="lesson-icon" />
                                                            <span className="lesson-name">
                                                                {index + 1}.{idx + 1} - {child.title}
                                                            </span>
                                                            <span className="lesson-type">{child.content_type}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )))
                                        :
                                        <p>No modules available yet</p>
                            }
                        </div>
                    </div>
                </div>
                <CommentPage courseId={params.id} />
            </section>
            <FooterPreview
                courseId={params.id}
                cost={data?.cost ?? 0}
                status={data?.status ?? 'not_enrolled'}
                loading={isLoading}
            />
        </section>
    )
}