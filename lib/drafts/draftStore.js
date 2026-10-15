'use client';

/**
 * Local (per-browser) storage for coding-challenge drafts, backed by IndexedDB.
 *
 * Retention policy:
 *  - A draft with no activity for DRAFT_TTL_MS (30 days) is deleted, even if it was
 *    never submitted. Only workspaces that are currently open are exempt.
 *  - Total draft size in this browser is capped at DRAFT_QUOTA_BYTES (50 MB).
 *    When the cap is exceeded the oldest drafts are evicted first, but never a
 *    workspace that is open (in any tab) or a draft holding changes that have not
 *    been saved on the server (`dirty`).
 *  - The submit flow only touches a draft after the server confirmed the save
 *    (see `markDraftSubmitted`), following DRAFT_SUBMIT_POLICY.
 *
 * Storage layout: `drafts` holds full records (code included); `meta` mirrors the
 * small fields (size, dirty, timestamps) so policy checks never load draft bodies.
 */

export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DRAFT_QUOTA_BYTES = 50 * 1024 * 1024;

// 'keep'   -> keep the draft after a confirmed submit, marked clean (evictable).
// 'delete' -> delete the draft once the server has confirmed the submission.
export const DRAFT_SUBMIT_POLICY = 'keep';

const DB_NAME = 'codedev-drafts';
const DB_VERSION = 2;
const STORE = 'drafts';
const META = 'meta';
const LOCK_PREFIX = 'codedev-draft:';
const RECORD_OVERHEAD_BYTES = 512;

// Workspaces open in this tab (ref-counted) and drafts with an in-flight write.
const openKeys = new Map();
const pendingKeys = new Set();

let dbPromise = null;

export function isDraftStorageAvailable() {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function draftKey(userId, challengeId) {
    return `${userId}::${challengeId}`;
}

function byteSize(text = '') {
    return new TextEncoder().encode(text).length + RECORD_OVERHEAD_BYTES;
}

function toMeta(record) {
    return {
        key: record.key,
        userId: record.userId,
        size: record.size,
        dirty: record.dirty,
        updatedAt: record.updatedAt,
        lastAccessedAt: record.lastAccessedAt,
    };
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function openDb() {
    if (!isDraftStorageAvailable()) {
        return Promise.reject(new Error('IndexedDB is not available'));
    }

    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(STORE)) {
                    const store = db.createObjectStore(STORE, { keyPath: 'key' });
                    store.createIndex('byUser', 'userId', { unique: false });
                }

                if (!db.objectStoreNames.contains(META)) {
                    db.createObjectStore(META, { keyPath: 'key' });

                    // v1 -> v2: backfill metadata for drafts that already exist.
                    const tx = request.transaction;
                    tx.objectStore(STORE).openCursor().onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (!cursor) return;
                        tx.objectStore(META).put(toMeta(cursor.value));
                        cursor.continue();
                    };
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                // Another tab upgraded the schema: drop this handle so the next call reopens.
                db.onversionchange = () => {
                    db.close();
                    dbPromise = null;
                };
                resolve(db);
            };

            request.onerror = () => {
                dbPromise = null;
                reject(request.error);
            };
        });
    }

    return dbPromise;
}

async function withStores(mode, callback) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE, META], mode);
        const drafts = tx.objectStore(STORE);
        const meta = tx.objectStore(META);
        let result;

        Promise.resolve(callback({ drafts, meta }))
            .then((value) => { result = value; })
            .catch((error) => {
                tx.abort();
                reject(error);
            });

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Draft transaction aborted'));
    });
}

function putRecord(stores, record) {
    stores.drafts.put(record);
    stores.meta.put(toMeta(record));
}

function deleteRecord(stores, key) {
    stores.drafts.delete(key);
    stores.meta.delete(key);
}

// Keys of workspaces currently open in any tab (Web Locks), plus this tab's open/pending keys.
async function getProtectedKeys(extraKeys = []) {
    const keys = new Set([...openKeys.keys(), ...pendingKeys, ...extraKeys]);

    try {
        if (typeof navigator !== 'undefined' && navigator.locks?.query) {
            const { held = [], pending = [] } = await navigator.locks.query();
            for (const lock of [...held, ...pending]) {
                if (lock.name?.startsWith(LOCK_PREFIX)) {
                    keys.add(lock.name.slice(LOCK_PREFIX.length));
                }
            }
        }
    } catch {
        // Web Locks unsupported: fall back to this tab's own state.
    }

    return keys;
}

/**
 * Marks a workspace as open for as long as the returned release() is not called.
 * Uses a shared Web Lock so other tabs see it as protected too.
 */
export function openWorkspace(key) {
    openKeys.set(key, (openKeys.get(key) || 0) + 1);

    let released = false;
    let releaseLock = null;

    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        navigator.locks
            .request(`${LOCK_PREFIX}${key}`, { mode: 'shared' }, () => {
                // release() may run before the lock is granted (e.g. StrictMode remounts).
                if (released) return undefined;
                return new Promise((resolve) => { releaseLock = resolve; });
            })
            .catch(() => { });
    }

    return () => {
        if (released) return;
        released = true;

        const count = (openKeys.get(key) || 1) - 1;
        if (count <= 0) openKeys.delete(key);
        else openKeys.set(key, count);

        releaseLock?.();
    };
}

export function markPending(key, isPending) {
    if (isPending) pendingKeys.add(key);
    else pendingKeys.delete(key);
}

export async function getDraft(key) {
    if (!isDraftStorageAvailable()) return null;

    return withStores('readwrite', async (stores) => {
        const existing = await requestToPromise(stores.drafts.get(key));
        if (!existing) return null;

        // Opening a draft counts as activity for the 30-day window.
        const touched = { ...existing, lastAccessedAt: Date.now() };
        putRecord(stores, touched);
        return touched;
    });
}

/**
 * Saves a draft and then applies the retention policy.
 * Returns { record, evicted, expired, totalBytes, overQuota }.
 */
export async function saveDraft({ key, userId, challengeId, language, code, dirty, baseVersion = null }) {
    if (!isDraftStorageAvailable()) return null;

    const now = Date.now();

    const record = await withStores('readwrite', async (stores) => {
        const existing = await requestToPromise(stores.drafts.get(key));
        const next = {
            ...(existing || {}),
            key,
            userId: String(userId),
            challengeId: String(challengeId),
            language,
            code,
            size: byteSize(code),
            dirty: Boolean(dirty),
            baseVersion,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            lastAccessedAt: now,
        };
        putRecord(stores, next);
        return next;
    });

    const policy = await enforceDraftPolicies({ protectKeys: [key] });
    return { record, ...policy };
}

export async function deleteDraft(key) {
    if (!isDraftStorageAvailable()) return;
    await withStores('readwrite', (stores) => { deleteRecord(stores, key); });
}

/**
 * Called only after the server confirmed the submission was stored.
 * Edits made after the submitted snapshot (e.g. in another tab) are never discarded.
 */
export async function markDraftSubmitted({ key, code, submissionId, submittedAt, policy = DRAFT_SUBMIT_POLICY }) {
    if (!isDraftStorageAvailable()) return;

    await withStores('readwrite', async (stores) => {
        const existing = await requestToPromise(stores.drafts.get(key));
        if (!existing) return;

        const hasNewerEdits = existing.code !== code;

        if (policy === 'delete' && !hasNewerEdits) {
            deleteRecord(stores, key);
            return;
        }

        putRecord(stores, {
            ...existing,
            dirty: hasNewerEdits,
            submissionId,
            submittedAt: submittedAt ? new Date(submittedAt).getTime() : Date.now(),
        });
    });
}

/**
 * Deletes expired drafts, then evicts the oldest evictable drafts until the
 * browser total fits DRAFT_QUOTA_BYTES. Reads only the metadata store.
 */
export async function enforceDraftPolicies({ protectKeys = [], now = Date.now() } = {}) {
    if (!isDraftStorageAvailable()) {
        return { expired: [], evicted: [], totalBytes: 0, overQuota: false };
    }

    const protectedKeys = await getProtectedKeys(protectKeys);

    return withStores('readwrite', async (stores) => {
        const all = await requestToPromise(stores.meta.getAll());
        const expired = [];
        const evicted = [];
        const remaining = [];

        for (const draft of all) {
            const lastActivity = Math.max(draft.updatedAt || 0, draft.lastAccessedAt || 0);

            if (!protectedKeys.has(draft.key) && now - lastActivity > DRAFT_TTL_MS) {
                deleteRecord(stores, draft.key);
                expired.push(draft.key);
            } else {
                remaining.push(draft);
            }
        }

        let totalBytes = remaining.reduce((sum, d) => sum + (d.size || 0), 0);

        if (totalBytes > DRAFT_QUOTA_BYTES) {
            const candidates = remaining
                .filter((d) => !protectedKeys.has(d.key) && !d.dirty)
                .sort((a, b) => (a.lastAccessedAt || a.updatedAt || 0) - (b.lastAccessedAt || b.updatedAt || 0));

            for (const draft of candidates) {
                if (totalBytes <= DRAFT_QUOTA_BYTES) break;
                deleteRecord(stores, draft.key);
                evicted.push(draft.key);
                totalBytes -= draft.size || 0;
            }
        }

        return {
            expired,
            evicted,
            totalBytes,
            overQuota: totalBytes > DRAFT_QUOTA_BYTES,
        };
    });
}

export async function getDraftUsage() {
    if (!isDraftStorageAvailable()) return { count: 0, totalBytes: 0, quotaBytes: DRAFT_QUOTA_BYTES };

    const all = await withStores('readonly', (stores) => requestToPromise(stores.meta.getAll()));
    return {
        count: all.length,
        totalBytes: all.reduce((sum, d) => sum + (d.size || 0), 0),
        quotaBytes: DRAFT_QUOTA_BYTES,
    };
}
