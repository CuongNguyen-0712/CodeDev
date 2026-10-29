'use client';

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { authClient } from "@/clients/auth.client";
import { userClient } from "@/clients/user.client";
import { userQueries } from "@/queries/user.query";
import { userKeys } from "@/keys/user.keys";

import { ErrorReload } from "@/components/ui/error";
import LinkConflictDialog from "@/components/settings/linkConflictDialog";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuKeyRound, LuLoaderCircle } from "react-icons/lu";
import { SiGithub, SiGoogle } from "react-icons/si";

const PROVIDERS = [
    { id: "github", label: "GitHub", Icon: SiGithub },
    { id: "google", label: "Google", Icon: SiGoogle },
];
const LABEL = { github: "GitHub", google: "Google" };

const LINK_ERROR = {
    OAuthAccountInUse: (label) => `This ${label} account is already linked to another CodeDev account.`,
    EmailInUse: (label) => `The email on this ${label} account belongs to another verified CodeDev account. Connect a ${label} account with a different email.`,
    LinkExpired: () => "The connect request expired. Try again.",
    AlreadyConnected: (label) => `A ${label} account is already connected. Disconnect it first to use another one.`,
    Callback: (label) => `Could not connect ${label}. Please try again.`,
};

function MethodRow({ Icon, label, detail, connected, action }) {
    return (
        <li className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {label}
                    {connected ? <Badge variant="success">Connected</Badge> : <Badge variant="outline">Not connected</Badge>}
                </p>
                {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
            </div>
            {action}
        </li>
    );
}

/** Settings > Sign-in methods (docs/email-verification-plan.md 10.4, 10.5, 10.8). */
export default function SignInMethodsSection() {
    const { status } = useSession();
    const { showAlert: alert } = useApp();
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(null);
    const [conflict, setConflict] = useState(null);
    const reported = useRef(false);

    const { data, isLoading, isError, error, refetch } = useQuery(userQueries.signInMethods(status));

    // Back from the provider: /settings?linked=github or ?linkError=…&provider=github.
    useEffect(() => {
        if (reported.current) return;
        reported.current = true;

        const params = new URLSearchParams(window.location.search);
        const linked = params.get("linked");
        const linkError = params.get("linkError");
        if (!linked && !linkError) return;

        window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
        if (linked) {
            alert(200, `${LABEL[linked] || "Account"} connected.`);
            queryClient.invalidateQueries({ queryKey: userKeys.signInMethods() });
            queryClient.invalidateQueries({ queryKey: userKeys.me() });
        } else {
            const label = LABEL[params.get("provider")] || "the account";
            const report = () => alert(409, (LINK_ERROR[linkError] || LINK_ERROR.Callback)(label));
            // Unverified account (plan 12.4): the server kept who owns it, offer to switch there.
            if (linkError !== "OAuthAccountInUse") return report();
            userClient.getLinkConflict()
                .then((found) => (found ? setConflict(found) : report()))
                .catch(report);
        }
    }, [alert, queryClient]);

    const linked = new Map((data?.providers || []).map((p) => [p.provider, p]));
    const methodCount = linked.size + (data?.password ? 1 : 0);

    const handleConnect = async (provider) => {
        setPending(provider);
        try {
            await authClient.connectProvider(provider);
        } catch (err) {
            setPending(null);
            alert(err?.status || 500, err?.message || `Could not connect ${LABEL[provider]}.`);
        }
    };

    const handleDisconnect = async (provider) => {
        setPending(provider);
        try {
            await userClient.disconnectProvider(provider);
            alert(200, `${LABEL[provider]} disconnected.`);
            await queryClient.invalidateQueries({ queryKey: userKeys.signInMethods() });
        } catch (err) {
            alert(err?.status || 500, err?.message || `Could not disconnect ${LABEL[provider]}.`);
        } finally {
            setPending(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-3 p-4" role="status" aria-busy="true" aria-label="Loading sign-in methods">
                {[0, 1, 2].map((index) => (
                    <div key={index} className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-md" />
                        <Skeleton className="h-4 w-48 max-w-full" />
                    </div>
                ))}
            </div>
        );
    }

    if (isError) {
        return <ErrorReload data={error} refetch={refetch} title="Could not load your sign-in methods" />;
    }

    return (
        <>
        {conflict && <LinkConflictDialog conflict={conflict} onClose={() => setConflict(null)} />}
        <ul className="divide-y">
            <MethodRow
                Icon={LuKeyRound}
                label="Password"
                connected={Boolean(data?.password)}
                detail={data?.password ? "Sign in with your username and password." : "No password on this account."}
            />
            {PROVIDERS.map(({ id, label, Icon }) => {
                const account = linked.get(id);
                const busy = pending === id;
                const isLast = Boolean(account) && methodCount <= 1;

                return (
                    <MethodRow
                        key={id}
                        Icon={Icon}
                        label={label}
                        connected={Boolean(account)}
                        detail={account
                            ? (isLast ? "Add another sign-in method before disconnecting this one." : account.email || null)
                            : null}
                        action={(
                            <Button
                                type="button"
                                variant={account ? "ghost" : "outline"}
                                size="sm"
                                disabled={Boolean(pending) || isLast}
                                onClick={() => (account ? handleDisconnect(id) : handleConnect(id))}
                                aria-label={`${account ? "Disconnect" : "Connect"} ${label}`}
                            >
                                {busy && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                                {account ? "Disconnect" : "Connect"}
                            </Button>
                        )}
                    />
                );
            })}
        </ul>
        </>
    );
}
