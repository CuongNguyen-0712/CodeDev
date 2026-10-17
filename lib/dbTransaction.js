import { dbPool } from "@/lib/db";

/**
 * Runs `callback(client)` inside BEGIN / COMMIT on one pooled connection; any error rolls back.
 * A failed COMMIT is marked `commitUncertain` (the server may have applied it before the
 * connection dropped), so callers never report such a write as "nothing happened".
 */
export async function withTransaction(callback) {
    const client = await dbPool.connect();

    try {
        await client.query("BEGIN");
        const result = await callback(client);

        try {
            await client.query("COMMIT");
        } catch (error) {
            error.commitUncertain = true;
            throw error;
        }

        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        throw error;
    } finally {
        client.release();
    }
}
