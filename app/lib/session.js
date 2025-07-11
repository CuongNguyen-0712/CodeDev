'use server'

import 'server-only'
import { neon } from '@neondatabase/serverless'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

const sql = neon(process.env.DATABASE_URL)
const secretKey = process.env.SESSION_KEY
const encodedKey = new TextEncoder().encode(secretKey);

export async function encrypt(payload) {
    try {
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(encodedKey);
        return token;
    } catch (error) {
        console.error('Encrypt error:', error.message);
        throw error;
    }
}

export async function decrypt(session) {
    try {
        const { payload } = await jwtVerify(session, encodedKey, {
            algorithms: ['HS256'],
        })
        return payload
    } catch (error) {
        console.log('Failed to verify session')
    }
}

export async function createSession({ data }) {
    const { userId, username, email } = data
    if (
        !userId || typeof userId !== 'string'
        || !username || typeof username !== 'string'
        || !email || typeof email !== 'string'
    ) {
        throw new Error('Invalid session data');
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await encrypt({ userId, username, email, expiresAt });
    const cookieStore = await cookies();

    cookieStore.set('session', session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        expires: expiresAt,
        sameSite: 'lax',
        path: '/',
    })
}

export async function getSession() {
    const cookieStore = await cookies()
    const session = cookieStore.get('session')?.value
    return await decrypt(session)
}

export async function deleteSession() {
    const cookieStore = await cookies()
    const id = (await getSession())?.userId
    await sql`delete from storage.session where id = ${id}`
    cookieStore.delete('session')
}