'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import {
    draftKey,
    deleteDraft,
    enforceDraftPolicies,
    getDraft,
    isDraftStorageAvailable,
    markDraftSubmitted,
    markPending,
    openWorkspace,
    saveDraft,
} from "@/lib/drafts/draftStore";

const SAVE_DEBOUNCE_MS = 800;

/**
 * Keeps a coding workspace in sync with its local IndexedDB draft.
 *
 * Source priority on load: newest of (local draft with unsaved changes, server
 * workspace snapshot), then the server snapshot, then the starter code.
 */
export default function useCodeDraft({
    userId,
    challengeId,
    language = "javascript",
    starterCode = "",
    server = null,
    enabled = true,
}) {
    const key = userId && challengeId ? draftKey(userId, challengeId) : null;

    const [code, setCodeState] = useState("");
    const [ready, setReady] = useState(false);
    const [status, setStatus] = useState("idle"); // idle | saving | saved | error | unavailable
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [restoredFrom, setRestoredFrom] = useState(null); // 'draft' | 'server' | 'starter'
    const [overQuota, setOverQuota] = useState(false);

    const codeRef = useRef("");
    const baselineRef = useRef("");
    const timerRef = useRef(null);
    const pendingRef = useRef(false);

    const persist = useCallback(async (value) => {
        if (!key || !isDraftStorageAvailable()) return;

        clearTimeout(timerRef.current);
        timerRef.current = null;
        setStatus("saving");

        try {
            const result = await saveDraft({
                key,
                userId,
                challengeId,
                language,
                code: value,
                dirty: value !== baselineRef.current,
                baseVersion: server?.version ?? null,
            });

            setLastSavedAt(Date.now());
            setOverQuota(Boolean(result?.overQuota));
            setStatus("saved");
        } catch (error) {
            console.error("[drafts] Failed to save draft:", error);
            setStatus("error");
        } finally {
            if (codeRef.current === value) {
                pendingRef.current = false;
                markPending(key, false);
            }
        }
    }, [key, userId, challengeId, language, server?.version]);

    const flush = useCallback(async () => {
        if (pendingRef.current) {
            await persist(codeRef.current);
        }
    }, [persist]);

    // Hold the "open workspace" protection for as long as this editor is mounted.
    useEffect(() => {
        if (!key) return;
        return openWorkspace(key);
    }, [key]);

    // Initialise once per workspace. Later refetches of the server payload must not
    // overwrite what the user is typing.
    const initializedKeyRef = useRef(null);

    useEffect(() => {
        if (!enabled || !key || initializedKeyRef.current === key) return;

        let cancelled = false;

        (async () => {
            const serverCode = server?.code ?? null;
            const serverUpdatedAt = server?.updatedAt ? new Date(server.updatedAt).getTime() : 0;
            baselineRef.current = serverCode ?? starterCode;

            if (!isDraftStorageAvailable()) {
                if (cancelled) return;
                initializedKeyRef.current = key;
                codeRef.current = serverCode ?? starterCode;
                setCodeState(codeRef.current);
                setRestoredFrom(serverCode !== null ? "server" : "starter");
                setStatus("unavailable");
                setReady(true);
                return;
            }

            let draft = null;
            try {
                draft = await getDraft(key);
            } catch (error) {
                console.error("[drafts] Failed to read draft:", error);
            }

            if (cancelled) return;

            let initial = serverCode ?? starterCode;
            let source = serverCode !== null ? "server" : "starter";

            // A draft at least as new as the server snapshot wins. Only unsaved (dirty)
            // drafts are announced as "restored"; a clean one equals the last submission.
            if (draft && (draft.updatedAt || 0) >= serverUpdatedAt) {
                initial = draft.code;
                if (draft.dirty) {
                    source = "draft";
                } else {
                    baselineRef.current = draft.code;
                }
            }

            initializedKeyRef.current = key;
            codeRef.current = initial;
            setCodeState(initial);
            setRestoredFrom(source);
            setLastSavedAt(draft?.updatedAt || null);
            setReady(true);

            // Housekeeping: expire/evict other drafts while this one is protected.
            enforceDraftPolicies({ protectKeys: [key] })
                .then((result) => !cancelled && setOverQuota(Boolean(result?.overQuota)))
                .catch(() => { });
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled, key, starterCode, server?.code, server?.updatedAt]);

    // Flush on tab hide / unload / unmount so nothing typed is lost.
    useEffect(() => {
        if (!key) return;

        const onHide = () => {
            if (document.visibilityState === "hidden") flush();
        };

        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", flush);

        return () => {
            document.removeEventListener("visibilitychange", onHide);
            window.removeEventListener("pagehide", flush);
            flush();
            markPending(key, false);
        };
    }, [key, flush]);

    const setCode = useCallback((value) => {
        codeRef.current = value;
        setCodeState(value);

        if (!key || !isDraftStorageAvailable()) return;

        pendingRef.current = true;
        markPending(key, true);
        setStatus("saving");

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => persist(value), SAVE_DEBOUNCE_MS);
    }, [key, persist]);

    const resetToStarter = useCallback(() => {
        setCode(starterCode);
    }, [setCode, starterCode]);

    // Must only be called after the server confirmed the submission was stored.
    const markSubmitted = useCallback(async ({ code: submittedCode, submissionId, submittedAt }) => {
        baselineRef.current = submittedCode;
        if (!key) return;

        try {
            await flush();
            await markDraftSubmitted({ key, code: submittedCode, submissionId, submittedAt });
        } catch (error) {
            console.error("[drafts] Failed to update draft after submit:", error);
        }
    }, [key, flush]);

    const discardDraft = useCallback(async () => {
        if (!key) return;
        clearTimeout(timerRef.current);
        pendingRef.current = false;
        markPending(key, false);
        await deleteDraft(key).catch(() => { });
        codeRef.current = baselineRef.current;
        setCodeState(baselineRef.current);
        setRestoredFrom(server?.code != null ? "server" : "starter");
        setLastSavedAt(null);
        setStatus("idle");
    }, [key, server?.code]);

    return {
        code,
        setCode,
        ready,
        status,
        lastSavedAt,
        restoredFrom,
        overQuota,
        isDirty: code !== baselineRef.current,
        flush,
        resetToStarter,
        markSubmitted,
        discardDraft,
    };
}
