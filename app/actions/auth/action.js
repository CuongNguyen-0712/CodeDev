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

        params.push(name)

        const query = `select * from log_in($${params.length})`

        const data = await sql.query(query, params)

        if (!data || data.length === 0) {
            return new Response(
                JSON.stringify({ success: false, message: "Invalid credentials" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            )
        }

        const authPassword = await bcrypt.compare(pass, data[0].password)

        if (!authPassword) {
            return new Response(
                JSON.stringify({ success: false, message: "Invalid credentials" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            )
        }

        const userId = data[0].id

        const session = await createSession({ userId: userId, username: data[0].username, email: data[0].email })

        if (!session) {
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
    const { surname, name, email, username, password } = data
    if (!surname || !name || !email || !username || !password) {
        return new Response(JSON.stringify({ success: false, message: "Missing credentials" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const params = []

        const id = uuidv4();
        const salt = await bcrypt.genSalt()
        const hashPassword = await bcrypt.hash(password, salt)

        params.push(id, username, hashPassword, surname, name, email)

        const query = `call add_user($1, $2, $3, $4, $5, $6)`
        await sql.query(query, params)

        return new Response(JSON.stringify({ success: true, message: "Sign up successfully, go to login" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ success: false, message: "Failed to sign up, please try again later" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}