"use client";

import { useEffect, useRef } from "react";

import { acquireChannel, getPusherClient, releaseChannel } from "@/lib/pusherClient";

/**
 * Subscribes to a Pusher channel for the lifetime of the component.
 *
 * @param {string|null} channelName - null/empty disables the subscription
 * @param {Record<string, (data: any) => void>} handlers - event name -> handler (latest closure is used)
 * @param {{ onReconnect?: () => void }} [options] - called after the socket comes back from a drop,
 *   since events sent while offline are lost (refetch what the events would have updated)
 */
export function usePusherChannel(channelName, handlers, { onReconnect } = {}) {
    const handlersRef = useRef(handlers);
    const reconnectRef = useRef(onReconnect);

    useEffect(() => {
        handlersRef.current = handlers;
        reconnectRef.current = onReconnect;
    });

    const eventNames = Object.keys(handlers || {}).sort().join("|");

    useEffect(() => {
        if (!channelName) return;

        const channel = acquireChannel(channelName);
        if (!channel) return;

        const bound = eventNames.split("|").filter(Boolean).map((event) => {
            const listener = (data) => handlersRef.current?.[event]?.(data);
            channel.bind(event, listener);
            return [event, listener];
        });

        const onSubscriptionError = (status) => {
            console.warn(`[Pusher] Subscription to ${channelName} failed:`, status?.status ?? status);
        };
        channel.bind("pusher:subscription_error", onSubscriptionError);

        const connection = getPusherClient()?.connection;
        let wasDisconnected = false;
        const onStateChange = ({ current }) => {
            if (current === "unavailable" || current === "disconnected" || current === "connecting") {
                wasDisconnected = true;
            }
            if (current === "connected" && wasDisconnected) {
                wasDisconnected = false;
                reconnectRef.current?.();
            }
        };
        connection?.bind("state_change", onStateChange);

        return () => {
            bound.forEach(([event, listener]) => channel.unbind(event, listener));
            channel.unbind("pusher:subscription_error", onSubscriptionError);
            connection?.unbind("state_change", onStateChange);
            releaseChannel(channelName);
        };
    }, [channelName, eventNames]);
}

export default usePusherChannel;
