import { useState, useTransition } from "react";

import Link from "next/link";

import { levelMapping } from "@/app/utils/constants";

import { LoadingContent } from "@/app/component/ui/loading";

import { useRouterActions } from "@/app/router/useRouterActions";

import { useApp } from "@/app/contexts/appContext";

import { useSession } from "next-auth/react";

import { useCourseRegister } from "@/app/mutation/course.mutation";

import { FaStar, FaUser, FaCode, FaCoins } from "react-icons/fa";
import { BiDetail } from "react-icons/bi";
import { MdCategory } from "react-icons/md";

export const CourseItem = ({ item }) => {
    const level = levelMapping[item.level] || levelMapping['beginner']
    const cost = Number(item.cost);
    const points = Number(item.points);

    const { data: session } = useSession();

    const [dataRegistered, setDataRegistered] = useState([]);
    const [isNavigating, startTransition] = useTransition();

    const { showAlert: alert } = useApp();
    const { navigate } = useRouterActions();

    const registerMutation = useCourseRegister();

    const handleRegister = async ({ id, isCost }) => {
        if (!session) {
            alert(401, 'Please log in to continue.');
            return;
        }

        if (isCost) {
            alert(400, 'The payment feature is not supported yet. Please try again later.');
            return;
        }

        if (dataRegistered.includes(id)) {
            startTransition(() => {
                navigate({ path: `learning/${id}` });
            });
            return;
        }

        try {
            await registerMutation.mutateAsync(id);

            setDataRegistered((prev) => [...prev, id]);
            alert(201, 'Successfully registered for the course.', () => navigate({ path: `learning/${id}` }));
        }
        catch (error) {
            alert(error.status || 500, error.message || 'An error occurred while registering for the course.');
        }
    }

    return (
        <div className="course-card">
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

                <img
                    src={item.language_logo || '/image/static/no_image.png'}
                    alt={item.title}
                    height={60}
                    width={60}
                    className="language-logo"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />

                <div className="course-rating">
                    <FaStar className="star-icon" />
                    <span>{item.rating}</span>
                </div>

                <div
                    className="course-level"
                    style={{
                        color: level.color,
                        background: level.bg
                    }}
                >
                    {level.label}
                </div>
            </div>

            <div className="course-card-body">
                <h3 className="course-title">{item.title}</h3>
                <p className="course-properties">{`${item.modules} modules - ${item.lessons} lessons - ${item.duration} minutes`}</p>
                <div className="course-meta">
                    <Link href={'#'} className="meta-item language">
                        <FaCode />
                        <span>{item.language_name}</span>
                    </Link>
                    <Link href={'#'} className="meta-item category">
                        <MdCategory />
                        <span>{item.category_name}</span>
                    </Link>
                    <Link href={'#'} className="meta-item instructor">
                        <FaUser />
                        <span>{item.instructor}</span>
                    </Link>
                </div>
            </div>

            <div className="course-card-footer">
                {
                    points > 0 && (
                        <button className="course-points">
                            <FaCoins fontSize={14} color="var(--color-warning)" />
                            <span>{points}</span>
                        </button>
                    )
                }
                <button
                    className={`course-enroll-btn ${cost > 0 ? 'paid' : ''}`}
                    onClick={() => handleRegister({ id: item.id, isCost: cost > 0 })}
                    disabled={registerMutation.isPending}
                >
                    {registerMutation.isPending || isNavigating ?
                        <LoadingContent scale={0.5} color="var(--white)" />
                        :
                        dataRegistered.includes(item.id) ?
                            'Learning'
                            :
                            cost === 0 ? 'Enroll Free' : `$${cost.toFixed(2)}`
                    }
                </button>
                <Link
                    className="course-detail-btn"
                    disabled={registerMutation.isPending}
                    href={`/course/${item.id}`}
                    title="View Details"
                >
                    <BiDetail fontSize={18} />
                </Link>
            </div>
        </div>
    )
}