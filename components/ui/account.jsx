'use client';
import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useLogOut } from "@/mutations/auth.mutation";
import { useRouterActions } from "@/router/useRouterActions";
import { useQueryParams } from "@/router/useQueryParams";
import useOutside from "@/hooks/useOutside";
import { LoadingContent } from "./loading";

import { FaCoins, FaUser, FaCode, FaBookOpen } from "react-icons/fa";
import { RiRoadMapFill } from "react-icons/ri";
import { IoLogOut, IoSettingsSharp, IoClose } from "react-icons/io5";
import { MdHelpCenter, MdOutlineFeedback } from "react-icons/md";
import { HiChevronRight } from "react-icons/hi2";

export default function Account({ isAccountMobile, handleAccountMobile, alert }) {
    const { data: session, status } = useSession();
    const { navigate, navigateReplace } = useRouterActions();
    const updateQuery = useQueryParams();
    const queryClient = useQueryClient();
    const logoutMutation = useLogOut();

    const { data: userData } = useQuery(userQueries.me(status));

    const ref = useOutside({
        stateOutside: isAccountMobile,
        setStateOutside: handleAccountMobile,
    });

    // Close on Escape key
    useEffect(() => {
        if (!isAccountMobile) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleAccountMobile(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAccountMobile, handleAccountMobile]);

    const handleNavigate = (path) => {
        handleAccountMobile(false);
        navigate({ path });
    };

    const handleFeedback = () => {
        handleAccountMobile(false);
        updateQuery({ modal: 'feedback' });
    };

    const handleLogout = () => {
        if (logoutMutation.isPending) return;

        logoutMutation.mutate(null, {
            onSuccess: async () => {
                queryClient.clear();
                handleAccountMobile(false);
                await signOut({ redirect: false });
                navigateReplace('/');
            },
            onError: (error) => {
                alert(error?.status || 500, error?.message || 'Failed to logout');
            }
        });
    };

    if (status !== 'authenticated') return null;

    const currentUser = userData || session?.user;
    const points = Number(userData?.points ?? session?.user?.points ?? 0);
    const formattedPoints = points > 999 ? `${(points / 1000).toFixed(1)}k` : points;

    return (
        <section
            className={`account mobile ${isAccountMobile ? 'open' : 'closed'}`}
            ref={ref}
            aria-label="Account Mobile Drawer"
        >
            <div className="account_drag_bar" onClick={() => handleAccountMobile(false)} />

            <header className="account_header">
                <div className="account_user_main">
                    <div className="avatar_wrapper">
                        <img
                            src={currentUser?.image || '/image/static/no_image.png'}
                            alt="avatar"
                            height={52}
                            width={52}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/image/static/no_image.png';
                            }}
                            className="account_avatar_img"
                        />
                        <span className="online_indicator" />
                    </div>
                    <div className="account_info">
                        <div className="account_name_row">
                            <h3 title={currentUser?.username || "CodeDev User"}>
                                {currentUser?.username || "CodeDev User"}
                            </h3>
                            <span className="account_badge">{currentUser?.rank || 'Beginner'}</span>
                        </div>
                        <p title={currentUser?.email || "_"}>
                            {currentUser?.email || "_"}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    className="account_close_btn"
                    onClick={() => handleAccountMobile(false)}
                    aria-label="Close menu"
                >
                    <IoClose fontSize={20} />
                </button>
            </header>

            <div className="account_stats_card">
                <div className="stat_points">
                    <span className="stat_points_icon">
                        <FaCoins fontSize={18} />
                    </span>
                    <div className="stat_points_info">
                        <span className="stat_points_label">Reward Points</span>
                        <span className="stat_points_value">{formattedPoints} Coins</span>
                    </div>
                </div>
                <button
                    type="button"
                    className="account_profile_btn"
                    onClick={() => handleNavigate('/profile')}
                >
                    <FaUser fontSize={12} />
                    <span>Profile</span>
                    <HiChevronRight fontSize={13} />
                </button>
            </div>

            {/* Body: Action Groups */}
            <div className="account_body">
                <div className="account_menu_group">
                    <span className="account_group_title">Learning</span>
                    <button
                        type="button"
                        className="account_menu_item"
                        onClick={() => handleNavigate('/learning')}
                    >
                        <span className="menu_item_icon learning">
                            <FaCode fontSize={16} />
                        </span>
                        <div className="menu_item_text">
                            <span className="menu_item_title">Learning Space</span>
                            <span className="menu_item_sub">Continue your lessons & tasks</span>
                        </div>
                        <HiChevronRight className="menu_item_arrow" />
                    </button>

                    <button
                        type="button"
                        className="account_menu_item"
                        onClick={() => handleNavigate('/roadmap')}
                    >
                        <span className="menu_item_icon roadmap">
                            <RiRoadMapFill fontSize={16} />
                        </span>
                        <div className="menu_item_text">
                            <span className="menu_item_title">Learning Roadmap</span>
                            <span className="menu_item_sub">Structured developer path</span>
                        </div>
                        <HiChevronRight className="menu_item_arrow" />
                    </button>

                    <button
                        type="button"
                        className="account_menu_item"
                        onClick={() => handleNavigate('/course')}
                    >
                        <span className="menu_item_icon course">
                            <FaBookOpen fontSize={16} />
                        </span>
                        <div className="menu_item_text">
                            <span className="menu_item_title">Explore Courses</span>
                            <span className="menu_item_sub">Tutorials & certifications</span>
                        </div>
                        <HiChevronRight className="menu_item_arrow" />
                    </button>
                </div>

                <div className="account_menu_group">
                    <span className="account_group_title">Preferences & Help</span>
                    <button
                        type="button"
                        className="account_menu_item"
                        onClick={() => handleNavigate('/settings')}
                    >
                        <span className="menu_item_icon settings">
                            <IoSettingsSharp fontSize={16} />
                        </span>
                        <div className="menu_item_text">
                            <span className="menu_item_title">Account Settings</span>
                            <span className="menu_item_sub">Security, password & preferences</span>
                        </div>
                        <HiChevronRight className="menu_item_arrow" />
                    </button>

                    <button
                        type="button"
                        className="account_menu_item"
                        onClick={handleFeedback}
                    >
                        <span className="menu_item_icon feedback">
                            <MdOutlineFeedback fontSize={16} />
                        </span>
                        <div className="menu_item_text">
                            <span className="menu_item_title">Send Feedback</span>
                            <span className="menu_item_sub">Help us improve CodeDev</span>
                        </div>
                        <HiChevronRight className="menu_item_arrow" />
                    </button>

                    <button
                        type="button"
                        className="account_menu_item"
                        onClick={() => handleNavigate('/help')}
                    >
                        <span className="menu_item_icon help">
                            <MdHelpCenter fontSize={16} />
                        </span>
                        <div className="menu_item_text">
                            <span className="menu_item_title">Help Center</span>
                            <span className="menu_item_sub">Documentation & guides</span>
                        </div>
                        <HiChevronRight className="menu_item_arrow" />
                    </button>
                </div>
            </div>

            {/* Footer */}
            <footer className="account_footer">
                <button
                    type="button"
                    onClick={handleLogout}
                    disabled={logoutMutation.isPending}
                    className="account_logout_btn"
                >
                    {logoutMutation.isPending ? (
                        <LoadingContent scale={0.5} color="var(--rose-500)" />
                    ) : (
                        <>
                            <IoLogOut fontSize={18} />
                            <span>Log out</span>
                        </>
                    )}
                </button>
            </footer>
        </section>
    );
}