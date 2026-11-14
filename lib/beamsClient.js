"use client";

import { setWebPushStop } from "@/lib/authNavigation";
import { fetchWithAuthRetry } from "@/lib/authRefresh";

/**
 * Browser side of web push (docs/superpowers/specs/2026-11-07-beams-web-push-design.md 6.2).
 * The device is bound to one user's public id through Beams Authenticated Users, only after that
 * user turned it on in Settings on this browser (`webpush:{publicId}` in localStorage). The SDK
 * is loaded on demand, so pages of people who never opted in never download it.
 * The Beams Token is fetched through fetchWithAuthRetry: a tab reopened after idle carries an
 * expired access state, and the SDK's own TokenProvider would just fail with 401.
 */

const TOKEN_URL = "/api/pusher/beams-auth";
const FLAG_PREFIX = "webpush:";

let clientPromise = null;

const flagKey = (userId) => `${FLAG_PREFIX}${userId}`;

function readFlag(userId) {
    try {
        return localStorage.getItem(flagKey(userId)) === "1";
    } catch {
        return false;
    }
}

function writeFlag(userId, on) {
    try {
        if (on) localStorage.setItem(flagKey(userId), "1");
        else localStorage.removeItem(flagKey(userId));
    } catch {
        // Storage unavailable (private mode): push still works until the next page load.
    }
}

function anyFlag() {
    try {
        return Object.keys(localStorage).some((key) => key.startsWith(FLAG_PREFIX));
    } catch {
        return false;
    }
}

function getClient() {
    if (!clientPromise) {
        clientPromise = import("@pusher/push-notifications-web").then((mod) => {
            // Signing out unbinds the device (see lib/authNavigation).
            setWebPushStop(stopWebPush);
            return new mod.Client({ instanceId: process.env.NEXT_PUBLIC_BEAMS_INSTANCE_ID });
        });
        clientPromise.catch(() => { clientPromise = null; });
    }
    return clientPromise;
}

// Beams answers 404 for a device it already deleted (deleteBeamsUser on a remote revoke, or a
// sign-out stop cut short by the page unload), but the SDK keeps that device id locally: start()
// then does nothing and every setUserId / stop fails. Registering again with the old push
// subscription gets a 401 "Subscription is not registered with the given push service". Either
// way: forget the device locally, subscription included, so start() registers anew.
const isGone = (error) => /status code 404\b|Subscription is not registered/.test(String(error?.message));

// shortcut: mirrors the local half of the SDK's stop() (push-notifications-web 1.1.0 private
// fields); recheck on an SDK upgrade. The old push subscription goes too, awaited (the SDK does
// not await it): Beams refuses to register it again ("Subscription is not registered with the
// given push service"), so start() must subscribe afresh.
async function forgetDevice(client) {
    await client._deviceStateStore.clear();
    client._deviceId = null;
    client._token = null;
    client._userId = null;
    const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
}

// Stands in for the SDK's TokenProvider (setUserId only calls fetchToken).
const tokenProvider = {
    async fetchToken(userId) {
        const response = await fetchWithAuthRetry(`${TOKEN_URL}?user_id=${encodeURIComponent(userId)}`, { method: "GET" });
        if (!response.ok) {
            const error = new Error(`Beams token request failed (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    },
};

async function bind(client, userId) {
    const setUser = async () => {
        await client.start();
        await client.setUserId(userId, tokenProvider);
    };
    try {
        await setUser();
    } catch (error) {
        if (!isGone(error)) throw error;
        await forgetDevice(client);
        await setUser();
    }
}

/** Unbinds the device; a device Beams no longer knows is already unbound. */
async function unbind(client) {
    try {
        await client.stop();
    } catch (error) {
        if (!isGone(error)) throw error;
        await forgetDevice(client);
    }
}

// Another user's binding left on this device (shared browser) is removed before anything else.
async function dropOtherUser(client, userId) {
    const current = await client.getUserId();
    if (current && current !== userId) await unbind(client);
}

export function isWebPushSupported() {
    return typeof window !== "undefined"
        && Boolean(process.env.NEXT_PUBLIC_BEAMS_INSTANCE_ID)
        && "serviceWorker" in navigator
        && Boolean(window.PushManager)
        && "Notification" in window;
}

/** @returns {"unsupported" | "blocked" | "on" | "off"} */
export function webPushState(userId) {
    if (!isWebPushSupported()) return "unsupported";
    if (Notification.permission === "denied") return "blocked";
    return Notification.permission === "granted" && readFlag(userId) ? "on" : "off";
}

/** Settings switch on. Throws when the SDK fails, so the caller can tell the user. */
export async function enableWebPush(userId) {
    if (!isWebPushSupported()) return "off";
    const permission = await Notification.requestPermission();
    if (permission === "denied") return "blocked";
    if (permission !== "granted") return "off";

    const client = await getClient();
    await dropOtherUser(client, userId);
    await bind(client, userId);
    writeFlag(userId, true);
    return "on";
}

/**
 * Settings switch off: unbind this device, then forget the choice. Throws when Beams cannot be
 * reached, with the flag kept: the switch stays on rather than hide a device still bound.
 */
export async function disableWebPush(userId) {
    await unbind(await getClient());
    writeFlag(userId, false);
}

/**
 * On every page load: binds the device again for a user who opted in on this browser (a remote
 * revoke may have unbound it), and unbinds a device left bound to someone else or to nobody
 * signed in (`userId` null). Never throws.
 */
export async function resumeWebPush(userId) {
    if (!isWebPushSupported() || Notification.permission !== "granted") return;
    const opted = userId ? readFlag(userId) : false;
    // Only browsers where someone opted in can hold a binding: nobody else loads the SDK.
    if (!opted && !anyFlag()) return;
    try {
        const client = await getClient();
        await dropOtherUser(client, userId);
        if (opted) await bind(client, userId);
    } catch (error) {
        console.error("[Beams Client] resume failed:", error?.message);
    }
}

/** Sign out: unbind, keep the flag so the same user's next sign in turns push back on. */
export async function stopWebPush() {
    if (!clientPromise) return;
    try {
        await unbind(await clientPromise);
    } catch (error) {
        console.error("[Beams Client] stop failed:", error?.message);
    }
}
