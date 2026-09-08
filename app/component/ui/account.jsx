import Link from "next/link";

import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";

import useOutside from "@/app/hooks/useOutside";

import { useRouterActions } from "@/app/router/useRouterActions";

import { LoadingContent } from "./loading";

import { useQueryClient } from "@tanstack/react-query";
import { useLogOut } from "@/app/mutation/auth.mutation";

import { IoLogOut } from "react-icons/io5";
import { IoMdSettings } from "react-icons/io";

export default function Account({ isAccountMobile, handleAccountMobile, alert }) {
    const { data: session, status } = useSession();

    const { navigate } = useRouterActions();

    const queryClient = useQueryClient();

    const logoutMutation = useLogOut();

    const ref = useOutside({
        stateOutside: isAccountMobile,
        setStateOutside: handleAccountMobile,
    });

    const handleLogout = () => {
        if (logoutMutation.isPending) return;

        logoutMutation.mutate(null, {
            onSuccess: async () => {
                queryClient.clear();
                handleAccountMobile(false);

                await signOut({ callbackUrl: '/' });
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
                    src={session?.user?.image || '/image/static/no_image.png'}
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
                <Link href="/settings" className="settings">
                    <IoMdSettings fontSize={16} />
                    Settings
                </Link>
                <button
                    onClick={handleLogout}
                    disabled={logoutMutation.isPending}
                    className="danger"
                >
                    {
                        logoutMutation.isPending ?
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