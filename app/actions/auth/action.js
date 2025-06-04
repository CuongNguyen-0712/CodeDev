'use server'
import { neon } from "@neondatabase/serverless";
import { createSession } from "@/app/lib/session";

const sql = neon(process.env.DATABASE_URL);

export async function signIn(data) {
    const { name, pass } = data

    const res = await sql`select id from users where username = ${name} and password = ${pass} limit 1`
    const userId = res[0].id

    await createSession(userId)
}