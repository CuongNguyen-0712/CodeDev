import { useState, useTransition } from "react";

import Link from "next/link";

import { levelMapping } from "@/constants/constants";
import { LoadingContent } from "@/components/ui/loading";
import { useRouterActions } from "@/router/useRouterActions";
import { useApp } from "@/contexts/appContext";
import { useSession } from "next-auth/react";
import { useCourseRegister } from "@/mutations/course.mutation";

import { FaStar, FaBookOpen, FaClock, FaCode, FaCoins } from "react-icons/fa";
import { BiDetail } from "react-icons/bi";
import { MdCategory } from "react-icons/md";

import "@/styles/course/item.css";

export const CourseItem = ({ item }) => {
    const level = levelMapping[item.level] || levelMapping['beginner'];
    const cost = Number(item.cost || 0);
    const point_price = Number(item.point_price || 0);

    const { status } = useSession();

    const [dataRegistered, setDataRegistered] = useState([]);
    const [isNavigating, startTransition] = useTransition();

    const { showAlert: alert } = useApp();
    const { navigate } = useRouterActions();

    const registerMutation = useCourseRegister();

    const isEnrolled = dataRegistered.includes(item.id) || Boolean(item?.is_registered);

    const handleSubmit = async ({ id, isCost }) => {
        if (!id) return;

        if (isCost) {
            alert(400, 'The payment feature is not supported yet. Please try again later.');
            return;
        }

        if (isEnrolled) {
            startTransition(() => {
                navigate({ path: `/learning/${id}` });
            });
            return;
        }

        try {
            await registerMutation.mutateAsync(id);

            setDataRegistered((prev) => [...prev, id]);
            alert(201, 'Successfully registered for the course.', () => navigate({ path: `/learning/${id}` }));
        }
        catch (error) {
            alert(error.status || 500, error.message || 'An error occurred while registering for the course.');
        }
    };

    return (
        <article className="course-card">
            {/* Card Visual Header */}
            <div className="course-card-header">
                <img
                    src={item.image || '/image/static/no_image.png'}
                    alt={item.title}
                    className="placeholder-image"
                    loading="lazy"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />

                <div className="course-header-overlay" />

                {item.language_logo && (
                    <div className="language-logo-wrapper" title={item.language_name || 'Language'}>
                        <img
                            src={item.language_logo}
                            alt={item.language_name || 'Language'}
                            height={32}
                            width={32}
                            className="language-logo"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/image/static/no_image.png';
                            }}
                        />
                    </div>
                )}

                <div className="course-rating" title={`Rating: ${item.rating || 0}`}>
                    <FaStar className="star-icon" />
                    <span>{Number(item.rating || 0).toFixed(1)}</span>
                </div>

                <div
                    className="course-level"
                    style={{
                        color: level.color,
                        backgroundColor: level.bg,
                    }}
                >
                    {level.label}
                </div>
            </div>

            {/* Card Content Body */}
            <div className="course-card-body">
                <Link href={`/course/${item.id}`} className="course-title-link" title={item.title}>
                    <h3 className="course-title">{item.title}</h3>
                </Link>

                <div className="course-properties">
                    <div className='property' title={`${item.modules || 0} modules`}>
                        <FaBookOpen />
                        <span>{item.modules || 0} modules</span>
                    </div>
                    <div className='property' title={`${item.lessons || 0} lessons`}>
                        <FaCode />
                        <span>{item.lessons || 0} lessons</span>
                    </div>
                    <div className='property' title={`${item.duration || 0} minutes`}>
                        <FaClock style={{ color: 'var(--color-primary)' }} />
                        <span>{item.duration || 0} min</span>
                    </div>
                </div>

                <div className="course-meta">
                    <span className="meta-item language">
                        <FaCode />
                        <span>{item?.language_name || 'Unknown'}</span>
                    </span>
                    <span className="meta-item category">
                        <MdCategory />
                        <span>{item?.category_name || 'Unknown'}</span>
                    </span>
                </div>

                <div className="course-instructor">
                    <span>Instructor:</span>
                    <Link href={'#'} className="instructor-link">{item.instructor}</Link>
                </div>
            </div>

            {/* Card Action Footer */}
            {
                status === 'authenticated' &&
                <div className="course-card-footer">
                    {point_price > 0 && (
                        <button className='buy-with-points-btn' title={`Buy with ${point_price} points`}>
                            <span>Buy</span>
                            <FaCoins />
                        </button>
                    )}

                    <button
                        type="button"
                        className={`course-enroll-btn ${cost > 0 && !isEnrolled ? 'paid' : ''} ${isEnrolled ? 'enrolled' : ''}`}
                        onClick={() => handleSubmit({ id: item.id, isCost: cost > 0 && !isEnrolled })}
                        disabled={registerMutation.isPending || isNavigating}
                    >
                        {registerMutation.isPending || isNavigating ? (
                            <LoadingContent scale={0.5} color="var(--white)" />
                        ) : isEnrolled ? (
                            'Continue Learning'
                        ) : cost === 0 ? (
                            'Enroll Free'
                        ) : (
                            `$${cost.toFixed(2)}`
                        )}
                    </button>

                    <Link
                        className="course-detail-btn"
                        href={`/course/${item.id}`}
                        title="View Course Details"
                        aria-label="View Course Details"
                    >
                        <BiDetail fontSize={18} />
                    </Link>
                </div>
            }
        </article>
    );
};