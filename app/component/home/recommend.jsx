'use client';

import { useState, useRef, useEffect } from "react";
import { useRouterActions } from "@/app/router/useRouterActions";
import { useInfiniteQuery } from "@tanstack/react-query";
import { courseQueries } from "@/app/query/course.query";
import { levelMapping } from "@/app/utils/constants";

import {
    FaStar,
    FaFire,
    FaArrowRight,
    FaCode,
    FaClock,
    FaBookOpen,
    FaUser,
    FaChevronLeft,
    FaChevronRight,
    FaCoins
} from "react-icons/fa";
import { HiSparkles } from "react-icons/hi2";
import { TbRoute } from "react-icons/tb";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";

import "@/app/style/home/recommend.css";

export default function HomeRecommend() {
    const { navigate } = useRouterActions();
    const sliderRef = useRef(null);

    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    // Mouse drag-to-scroll state
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollStart, setScrollStart] = useState(0);
    const [hasDragged, setHasDragged] = useState(false);

    const {
        data,
        isLoading,
        isError,
        error,
        refetch
    } = useInfiniteQuery(courseQueries.list({ limit: 10, rating: ['5'] }));

    const courses = data?.pages.flatMap(page => page.data) || [];

    const checkScroll = () => {
        if (!sliderRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
        setCanScrollLeft(scrollLeft > 10);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    };

    useEffect(() => {
        checkScroll();
        const el = sliderRef.current;
        if (el) {
            el.addEventListener("scroll", checkScroll, { passive: true });
            window.addEventListener("resize", checkScroll);
            return () => {
                el.removeEventListener("scroll", checkScroll);
                window.removeEventListener("resize", checkScroll);
            };
        }
    }, [courses]);

    const scroll = (direction) => {
        if (sliderRef.current) {
            const scrollAmount = 305;
            sliderRef.current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth"
            });
        }
    };

    const handleMouseDown = (e) => {
        if (!sliderRef.current) return;
        setIsDragging(true);
        setHasDragged(false);
        setStartX(e.pageX - sliderRef.current.offsetLeft);
        setScrollStart(sliderRef.current.scrollLeft);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e) => {
        if (!isDragging || !sliderRef.current) return;
        e.preventDefault();
        const x = e.pageX - sliderRef.current.offsetLeft;
        const walk = (x - startX) * 1.3;
        if (Math.abs(walk) > 5) {
            setHasDragged(true);
        }
        sliderRef.current.scrollLeft = scrollStart - walk;
    };

    const handleCardClick = (courseId) => {
        if (hasDragged) return;
        navigate({ path: `course/${courseId}` });
    };

    const handleMoreClick = () => {
        if (hasDragged) return;
        navigate({ path: "course" });
    };

    return (
        <section className="overview-recommend" id="home_recommend">
            <div className="recommend-header">
                <div className="header-title-group">
                    <div className="header-icon-box">
                        <FaFire className="header-flame" />
                    </div>
                    <div className="header-text">
                        <h3>Featured Courses</h3>
                        <p>Handpicked courses curated for your engineering growth</p>
                    </div>
                </div>

                {/* NAVIGATION CONTROLS */}
                <div className="header-nav-actions">
                    <div className="carousel-nav-arrows">
                        <button
                            type="button"
                            className={`carousel-arrow-btn ${!canScrollLeft ? "disabled" : ""}`}
                            onClick={() => scroll("left")}
                            disabled={!canScrollLeft}
                            aria-label="Previous courses"
                            title="Previous"
                        >
                            <FaChevronLeft fontSize={12} />
                        </button>
                        <button
                            type="button"
                            className={`carousel-arrow-btn ${!canScrollRight ? "disabled" : ""}`}
                            onClick={() => scroll("right")}
                            disabled={!canScrollRight}
                            aria-label="Next courses"
                            title="Next"
                        >
                            <FaChevronRight fontSize={12} />
                        </button>
                    </div>

                    <button
                        type="button"
                        className="view-all-link-btn"
                        onClick={() => navigate({ path: "course" })}
                        title="View all courses"
                    >
                        <span>All Courses</span>
                        <FaArrowRight fontSize={12} />
                    </button>
                </div>
            </div>

            {/* CAROUSEL SWIPE TRACK */}
            <div className="carousel-outer-container">
                {isLoading ?
                    <LoadingContent scale={0.7} />
                    :
                    isError ?
                        <ErrorReload
                            data={error || { status: 500, message: "Could not load recommendations" }}
                            refetch={refetch}
                        />
                        : (
                            <div
                                className={`recommend-carousel-track ${isDragging ? "dragging" : ""}`}
                                ref={sliderRef}
                                onMouseDown={handleMouseDown}
                                onMouseLeave={handleMouseLeave}
                                onMouseUp={handleMouseUp}
                                onMouseMove={handleMouseMove}
                            >
                                {courses.map((item, index) => {
                                    const level = levelMapping[item.level] || levelMapping["beginner"];
                                    const cost = Number(item.cost || 0);
                                    const points = Number(item.points || 0);

                                    return (
                                        <div
                                            key={item.id || index}
                                            className="recommend-card swipe-item"
                                            onClick={() => handleCardClick(item.id)}
                                        >
                                            {/* CARD THUMBNAIL */}
                                            <div className="card-thumb-wrap">
                                                <img
                                                    src={item.image || "/image/static/no_image.png"}
                                                    alt={item.title}
                                                    className="thumb-image"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = "/image/static/no_image.png";
                                                    }}
                                                />

                                                <div className="thumb-overlay" />

                                                <div className="thumb-top-row">
                                                    <span className="badge-highlight">
                                                        <FaFire />
                                                        Hot
                                                    </span>

                                                    <span
                                                        className="badge-level"
                                                        style={{ color: level.color }}
                                                    >
                                                        {level.label}
                                                    </span>
                                                </div>

                                                <div className="tech-logo-float">
                                                    <img
                                                        src={item.language_logo || "/image/static/no_image.png"}
                                                        alt={item.language_name || "tech"}
                                                        width={26}
                                                        height={26}
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.src = "/image/static/no_image.png";
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="card-body-content">
                                                <div className="meta-category-row">
                                                    <span className="category-text">{item.category_name}</span>
                                                    <div className="rating-pill">
                                                        <FaStar className="star-gold" />
                                                        <span>{item?.rating || '_'}</span>
                                                    </div>
                                                </div>

                                                <h4 className="course-title" title={item.title}>
                                                    {item.title}
                                                </h4>

                                                {/* STATS STRIP */}
                                                <div className="meta-stats-row">
                                                    <span className="stat-chip">
                                                        <FaBookOpen />
                                                        {item?.modules || '__'} modules
                                                    </span>
                                                    <span className="stat-chip">
                                                        <FaCode />
                                                        {item?.lessons || '__'} lessons
                                                    </span>
                                                    <span className="stat-chip">
                                                        <FaClock />
                                                        {item?.duration || '__'}m
                                                    </span>
                                                </div>

                                                <div className="instructor-row">
                                                    <FaUser className="user-icon" />
                                                    <span>{item.instructor || "CodeDev Instructor"}</span>
                                                </div>
                                            </div>

                                            <div className="card-footer-actions">
                                                <div className="cost-info">
                                                    {cost === 0 ? (
                                                        <span className="free-tag">Free</span>
                                                    ) : (
                                                        <span className="price-tag">${cost.toFixed(2)}</span>
                                                    )}
                                                    {points > 0 && (
                                                        <div className="points-tag">
                                                            <span>or</span>
                                                            <span className="points">
                                                                {points} <FaCoins />
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    type="button"
                                                    className="btn-card-learn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCardClick(item.id);
                                                    }}
                                                >
                                                    <span>Start</span>
                                                    <FaArrowRight fontSize={11} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                <div
                                    className="recommend-card swipe-item recommend-more-card"
                                    onClick={handleMoreClick}
                                >
                                    <div className="more-card-content">
                                        <div className="more-icon-circle">
                                            <HiSparkles className="sparkle-more-icon" />
                                        </div>

                                        <div className="more-card-text">
                                            <span className="more-tag">Full Catalog</span>
                                            <h4>Explore 50+ More Courses</h4>
                                            <p>Find courses in Frontend, Backend, Cloud & AI.</p>
                                        </div>

                                        <div className="more-action-pill">
                                            <span>View All Courses</span>
                                            <FaArrowRight fontSize={12} className="arrow-bounce" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
            </div>

            <div className="recommend-roadmap-banner">
                <div className="banner-left">
                    <div className="banner-icon-circle">
                        <TbRoute />
                    </div>
                    <div className="banner-text">
                        <h4>Prefer a guided career roadmap?</h4>
                        <p>Follow our structured Frontend, Backend, and Fullstack developer tracks.</p>
                    </div>
                </div>

                <button
                    type="button"
                    className="banner-cta-btn"
                    onClick={() => navigate({ path: "roadmap" })}
                >
                    <span>View Roadmaps</span>
                    <FaArrowRight fontSize={12} />
                </button>
            </div>
        </section>
    );
}