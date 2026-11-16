// Phase 2 chat schema (replies, reactions, request push marker) against real PostgreSQL.
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.DATABASE_URL)("chat schema phase 2 (PostgreSQL)", () => {
    it("reply_to_id, chat_reaction and request_pushed_at exist with their keys", async () => {
        const { sql } = await import("@/lib/db");
        const cols = async (table) => Object.fromEntries((await sql(
            `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'community' AND table_name = $1`, [table]
        )).rows.map((r) => [r.column_name, r]));

        const msg = await cols("chat_message");
        expect(msg.reply_to_id).toMatchObject({ data_type: "bigint", is_nullable: "YES" });
        const member = await cols("conversation_member");
        expect(member.request_pushed_at).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "YES" });

        const reaction = await cols("chat_reaction");
        expect(reaction.message_id).toMatchObject({ data_type: "bigint", is_nullable: "NO" });
        expect(reaction.user_id).toMatchObject({ data_type: "bigint", is_nullable: "NO" });
        expect(reaction.emoji).toMatchObject({ data_type: "text", is_nullable: "NO" });
        expect(reaction.created_at).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "NO" });
        expect(reaction.created_at.column_default).toMatch(/now\(\)/);

        const { rows: cons } = await sql(
            `SELECT conrelid::regclass::text AS tbl, contype, confrelid::regclass::text AS ref, confdeltype, pg_get_constraintdef(oid) AS def
             FROM pg_constraint WHERE conrelid IN ('community.chat_reaction'::regclass, 'community.chat_message'::regclass) AND contype IN ('p', 'f')`);
        const pk = cons.find((c) => c.tbl === "community.chat_reaction" && c.contype === "p");
        expect(pk.def).toBe("PRIMARY KEY (message_id, user_id, emoji)");
        const fk = (tbl, col) => cons.find((c) => c.tbl === tbl && c.contype === "f" && c.def.startsWith(`FOREIGN KEY (${col})`));
        expect(fk("community.chat_reaction", "message_id")).toMatchObject({ ref: "community.chat_message", confdeltype: "c" });
        expect(fk("community.chat_reaction", "user_id")).toMatchObject({ ref: "identity.users", confdeltype: "c" });
        expect(fk("community.chat_message", "reply_to_id")).toMatchObject({ ref: "community.chat_message", confdeltype: "n" });
    });
});
