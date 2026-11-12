import { after } from "next/server";

/**
 * Runs `fn` once the response is sent. Outside a request (job, script, test) `after` throws, so `fn` runs
 * inline instead. `fn`'s errors are logged, never thrown.
 */
export async function runAfter(fn) {
    const safe = async () => {
        try {
            await fn();
        } catch (error) {
            console.error("[runAfter]", error);
        }
    };
    try {
        after(safe);
    } catch {
        await safe();
    }
}
