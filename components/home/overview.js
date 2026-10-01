'use client';

import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";
import { useRouterActions } from "@/router/useRouterActions";
import { levelMapping } from "@/constants/constants";
import { ErrorReload } from "../ui/error";

import { HiSparkles } from "react-icons/hi2";
import {
    FaStar,
    FaRankingStar,
    FaTrophy,
    FaArrowRight
} from "react-icons/fa6";
import { MdEdit } from "react-icons/md";

import "@/styles/home/welcome.css";
import HomeRecommend from "./recommend";

export default function HomeOverview() {
    const { navigate } = useRouterActions();
    const { status } = useSession();

    const isAuthenticated = status === 'authenticated';
    const isSessionLoading = status === 'loading';

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.me(status));

    const showLoading = isSessionLoading || (isAuthenticated && isLoading);

    const displayName = data?.name || data?.username || 'User';

    const currentLevel = (data?.level && levelMapping[data.level])
        ? levelMapping[data.level] : levelMapping['beginner'];

    const starsCount = data?.star ?? data?.stars ?? 0;
    const rankValue = `#${data?.rank ?? '__'}`;

    return (
        <div id="overview_content">
            <section className="overview-welcome">
                {showLoading ? (
                    <div className="welcome-skeleton" aria-label="Loading welcome profile">
                        <div className="skeleton-top">
                            <div className="skeleton-text">
                                <div className="skeleton-pill shimmer"></div>
                                <div className="skeleton-title shimmer"></div>
                                <div className="skeleton-desc shimmer"></div>
                            </div>
                            <div className="skeleton-avatar shimmer"></div>
                        </div>
                        <div className="skeleton-badges">
                            <div className="skeleton-badge shimmer"></div>
                            <div className="skeleton-badge shimmer"></div>
                            <div className="skeleton-badge shimmer"></div>
                        </div>
                    </div>
                ) : isError ? (
                    <div className="welcome-error-wrap">
                        <ErrorReload
                            data={error || { status: 500, message: "Could not load user profile" }}
                            refetch={refetch}
                        />
                    </div>
                ) : !isAuthenticated ? (
                    <div className="welcome-content guest-content">
                        <div className="welcome-text">
                            <span className="greeting">
                                <HiSparkles />
                                Welcome to CodeDev
                            </span>
                            <h1>Master Your Coding Journey</h1>
                            <p>
                                Explore curated programming roadmaps, interactive courses, and build real-world skills with CodeDev.
                            </p>
                            <div className="guest-actions">
                                <button
                                    type="button"
                                    className="guest-cta-primary"
                                    onClick={() => navigate({ path: 'auth/signin' })}
                                >
                                    <span>Get Started</span>
                                    <FaArrowRight />
                                </button>
                                <button
                                    type="button"
                                    className="guest-cta-secondary"
                                    onClick={() => navigate({ path: 'course' })}
                                >
                                    <span>Explore Courses</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="welcome-content">
                            <div className="welcome-text">
                                <span className="greeting">
                                    <HiSparkles />
                                    Welcome back
                                </span>
                                <h1>{displayName}</h1>
                                <p>
                                    {data?.bio || "Track your progress, level up your skills, and continue your learning journey."}
                                </p>
                            </div>
                            <div className="welcome-avatar">
                                <div className="avatar-ring">
                                    <img
                                        src={data?.image || '/image/static/no_image.png'}
                                        height={84}
                                        width={84}
                                        alt={displayName}
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = '/image/static/no_image.png';
                                        }}
                                    />
                                    <span className="avatar-status-dot" title="Active"></span>
                                </div>
                                <button
                                    type="button"
                                    className="edit-btn"
                                    onClick={() => navigate({ path: 'profile' })}
                                    title="Edit Profile"
                                    aria-label="Edit Profile"
                                >
                                    <MdEdit />
                                </button>
                            </div>
                        </div>

                        <div className="welcome-badges">
                            <div
                                className="badge level"
                                style={{ backgroundColor: currentLevel?.bg }}
                            >
                                <FaRankingStar style={{ color: currentLevel?.color }} />
                                <span>Level: <strong>{currentLevel?.label || 'Beginner'}</strong></span>
                            </div>

                            <div className="badge stars">
                                <FaStar className="star-icon" />
                                <span><strong>{starsCount}</strong> stars</span>
                            </div>

                            <div className="badge rank">
                                <FaTrophy className="trophy-icon" />
                                <span>Rank <strong>{rankValue}</strong></span>
                            </div>
                        </div>
                    </>
                )}
            </section>

            <HomeRecommend />
        </div>
    );
}