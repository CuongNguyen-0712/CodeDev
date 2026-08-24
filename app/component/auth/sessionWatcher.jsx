"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";

import { useQueryClient } from "@tanstack/react-query";

import { useLogOut } from "@/app/mutation/auth.mutation";

import DefaultLayout from "@/app/layout/defaultLayout";

import { useApp } from "@/app/contexts/appContext";

export function SessionWatcher() {
    const { showAlert: alert } = useApp();

    const handlingValidSessionRef = useRef(false);

    const { data: session, status } = useSession();

    const queryClient = useQueryClient();
    const logoutMutation = useLogOut();

    const handleSessionInvalid = () => {
        if (logoutMutation.isPending || handlingValidSessionRef.current) return;

        handlingValidSessionRef.current = true;

        logoutMutation.mutate(null, {
            onSuccess: async () => {
                queryClient.clear();

                await signOut({ callbackUrl: '/auth?error=SessionInvalid' });
            },

            onError: (error) => {
                handlingValidSessionRef.current = false;
                alert(500, error?.message || "An error occurred while logging out.");
            }
        });
    }

    useEffect(() => {
        if (status === "loading" || status === "unauthenticated") return;

        if (session?.error === "SessionInvalid") {
            handleSessionInvalid();
        }
    }, [session?.error, status]);

    return null;
}

export function AuthSessionWatcher() {
    return (
        <DefaultLayout>
            <SessionWatcher />
        </DefaultLayout>
    )
}