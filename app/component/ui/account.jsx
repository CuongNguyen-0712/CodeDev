import { useTransition } from "react";

import { useSession } from "next-auth/react";

import useOutside from "@/app/hooks/useOutside";

import { useRouterActions } from "@/app/router/useRouterActions";

import { LoadingContent } from "./loading";

import { useQueryClient } from "@tanstack/react-query";

import { useLogOut } from "@/app/mutation/auth.mutation";

import { FaArrowDown } from "react-icons/fa";
import { IoLogOut } from "react-icons/io5";

export default function Account({ isAccountMobile, handleAccountMobile }) {
    const { data: session, status } = useSession();

    const [isNavigating, startTransition] = useTransition();

    const { navigateReplace, navigate } = useRouterActions();

    const queryClient = useQueryClient();

    const logoutMutation = useLogOut();

    const ref = useOutside({
        stateOutside: isAccountMobile,
        setStateOutside: handleAccountMobile,
    });

    const handleLogout = async () => {
        if (logoutMutation.isPending) return;

        logoutMutation.mutate(null, {
            onSuccess: () => {
                queryClient.clear();
                startTransition(() => {
                    navigateReplace('/auth');
                });
            },
            onError: (error) => {
                alert(error.status, error.message);
            }
        });
    };

    return status === 'authenticated' &&
        <section className={`account mobile ${isAccountMobile ? 'open' : 'closed'}`} ref={ref}>
            <header className="account_header">
                <img
                    src={session?.user?.image}
                    alt="avatar"
                    height={80}
                    width={80}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />
                <div className="account_info">
                    <h3>{session?.user?.username ?? "_"}</h3>
                    <p>{session?.user?.email ?? "_"}</p>
                    <button className="view_profile" onClick={() => navigate({ path: '/profile' })}>
                        <span>View Profile</span>
                    </button>
                </div>
            </header>
            <div className="account_body">
                <p>Waiting for updates...</p>
            </div>
            <footer className="account_footer">
                <button onClick={() => handleAccountMobile(false)} className="close">
                    <FaArrowDown fontSize={16} />
                </button>
                <button
                    onClick={handleLogout}
                    disabled={logoutMutation.isPending || isNavigating}
                    className="danger"
                >
                    {
                        logoutMutation.isPending || isNavigating ?
                            <LoadingContent scale={0.5} color="var(--white)" />
                            :
                            <>
                                <IoLogOut fontSize={16} />
                                <span>Logout</span>
                            </>
                    }
                </button>
            </footer>
        </section>
}