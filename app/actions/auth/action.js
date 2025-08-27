'use server'
import { neon } from "@neondatabase/serverless";

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

import { createSession } from "@/app/lib/session";

const sql = neon(process.env.DATABASE_URL);

export async function signIn(data) {
    const { name, pass } = data

    if (!name || !pass) {
        return new Response(JSON.stringify({ success: false, message: "Missing credentials" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        )
    }

    try {
        const res = await sql`
            select 
                u.id as id,
                u.password as password,
                u.username as username,
                i.email as email
            from private.users u
            join private.info i on i.id = u.id
            where username = ${name} 
            limit 1
            `

        if (res.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: "Invalid credentials" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            )
        }

        const auth = await bcrypt.compare(pass, res[0].password)

        if (!auth) {
            return new Response(
                JSON.stringify({ success: false, message: "Invalid credentials" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            )
        }

        const userId = await res[0].id

        const checkSession = await sql
            `
            insert into storage.session (id) values (${userId})
            on conflict (id) do nothing
            returning id
            `

        if (checkSession.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: "Something went wrong, please try again" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            )
        }

        const sessionRes = await createSession({ userId: userId, username: await res[0].username, email: await res[0].email })

        if (sessionRes) {
            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            )
        }
        else {
            return new Response(
                JSON.stringify({ success: false, message: 'Failed to log in, please try again' }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }
    } catch (error) {
        console.error("Error:", error);
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

        await sql`INSERT INTO private.info (id, surname, name, email, phone) VALUES (${id}, ${surname}, ${name}, ${email}, ${phone})`
        await sql`INSERT INTO private.users (id, username, password) VALUES (${id}, ${username}, ${hashPassword})`

        return new Response(JSON.stringify({ success: true, message: "Sign up successfully, go to login" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    }
    catch (err) {
        return new Response(JSON.stringify({ success: false, message: "Failed to load content, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}