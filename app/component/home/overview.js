import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/app/query/user.query";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";

import { useSession } from "next-auth/react";

import { useRouterActions } from "@/app/router/useRouterActions";

import { levelMapping } from "@/app/utils/constants";

import { HiSparkles } from "react-icons/hi2";
import { FaStar, FaChartLine } from "react-icons/fa";
import { FaRankingStar } from "react-icons/fa6";
import { MdEdit } from "react-icons/md";
export default function HomeOverview() {
    const { navigate } = useRouterActions();
    const { status } = useSession();

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.me(status));

    return (
        <section className="overview-welcome">
            {isLoading ?
                <LoadingContent color={'var(--white)'} />
                : isError ?
                    <ErrorReload data={error || { status: 500, message: "Something is wrong !" }} refetch={refetch} />
                    :
                    <>
                        <div className="welcome-content">
                            <div className="welcome-text">
                                <span className="greeting">
                                    <HiSparkles />
                                    Welcome back
                                </span>
                                <h1>{data?.username}</h1>
                                <p>Track your progress and continue your learning journey</p>
                            </div>
                            <div className="welcome-avatar">
                                <img
                                    src={data?.image || '/image/static/no_image.png'}
                                    height={80}
                                    width={80}
                                    alt="avatar"
                                    priority="high"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = '/image/static/no_image.png';
                                    }}
                                />
                                <button className="edit-btn" onClick={() => navigate({ path: 'profile' })}>
                                    <MdEdit />
                                </button>
                            </div>
                        </div>
                        <div className="welcome-badges">
                            <div className="badge level">
                                <FaRankingStar />
                                <span>
                                    {levelMapping[data?.level]?.label || '__'}
                                </span>
                            </div>
                            <div className="badge stars">
                                <FaStar />
                                <span>{data?.stars || 0} stars</span>
                            </div>
                            <div className="badge rank">
                                <FaChartLine />
                                <span>Rank #{data?.rank || 0}</span>
                            </div>
                        </div>
                    </>
            }
        </section>
    )
}