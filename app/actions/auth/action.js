'use server'
import { sql } from '@/app/lib/db';

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

import { createSession } from "@/app/lib/session";

export async function signIn(data) {
    const { name, pass } = data

    if (!name || !pass) {
        return new Response(JSON.stringify({ success: false, message: "Missing credentials" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        )
    }

    try {
        const params = []
        const conditions = []

        params.push(name)
        conditions.push(`u.username = $${params.length}`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const query = `
            select 
                u.id as id,
                u.password as password,
                u.username as username,
                i.email as email
            from private.users u
            join private.info i on i.user_id = u.id
            ${whereSQL}
            limit 1
            `
        const res = await sql.query(query, params)

        if (res.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: "Invalid credentials" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            )
        }

        const isHash = await bcrypt.compare(pass, res[0].password)

        if (!isHash) {
            return new Response(
                JSON.stringify({ success: false, message: "Invalid credentials" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            )
        }

        const userId = res[0].id

        const queryCheck = `
            insert into storage.session (id) values ($1)
            on conflict (id) do nothing
            returning id
        `

        const checkSession = await sql.query(queryCheck, [userId]);

        if (checkSession.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: "Something went wrong, please try again" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            )
        }

        const resSession = await createSession({ userId: userId, username: res[0].username, email: res[0].email })

        if (!resSession) {
            return new Response(
                JSON.stringify({ success: false, message: "Something went wrong, please try again" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            )
        }
        else {
            return new Response(
                JSON.stringify({ success: true, message: "Login successfully, redirecting..." }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            )
        }

    } catch (error) {
        console.error("Error sign in:", error);
        return new Response(
            JSON.stringify({ success: false, message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function signUp(data) {
    const { surname, name, email, phone, username, password } = data
    if (!surname || !name || !email || !phone || !username || !password) {
        return new Response(JSON.stringify({ success: false, message: "Missing credentials" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    const existingUser = await sql`SELECT 1 FROM private.users WHERE username = ${username} LIMIT 1`

    if (existingUser.length > 0) {
        return new Response(JSON.stringify({ success: false, message: "Username already exists" }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const id = uuidv4();
        const hashPassword = await bcrypt.hash(password, 10)

        await sql`call add_user(${id}, ${username}, ${hashPassword}, ${surname},${name}, ${email}, ${phone});`

        return new Response(JSON.stringify({ success: true, message: "Sign up successfully, go to login" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ success: false, message: "Failed to load content, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}