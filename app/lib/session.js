'use server'

import 'server-only'
import { sql } from '@/app/lib/db'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { redirect } from 'next/navigation'

const secretKey = process.env.SESSION_KEY
const encodedKey = new TextEncoder().encode(secretKey);

export async function encrypt(payload) {
    try {
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('1d')
            .sign(encodedKey);
        return token;
    } catch (error) {
        console.error('Encrypt error:', error.message);
        return null;
    }
}

export async function decrypt(session) {
    try {
        const { payload } = await jwtVerify(session, encodedKey, {
            algorithms: ['HS256'],
        })
        return payload
    } catch (error) {
        console.error('Failed to verify session:', error.message)
        return null;
    }
}

export async function createSession(data) {
    const { userId, username, email } = data
    if (
        !userId || typeof userId !== 'string'
        || !username || typeof username !== 'string'
        || !email || typeof email !== 'string'
    ) {
        console.error('Invalid session data:', data)
        return false;
    }

    try {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
        const session = await encrypt({ userId, username, email, expiresAt });
        const cookieStore = await cookies();

        cookieStore.set('session', session, {
            httpOnly: process.env.NODE_ENV === 'production',
            secure: process.env.NODE_ENV === 'production',
            expires: expiresAt,
            sameSite: 'lax',
            path: '/',
        })

        return true
    }
    catch (err) {
        console.error('Failed to create session:', err.message)
        return false;
    }
}

export async function getSession() {
    const cookieStore = await cookies()
    const session = cookieStore.get('session')?.value
    if (!session) return null
    return await decrypt(session)
}

export async function deleteSession() {
    const cookieStore = await cookies()
    const id = (await getSession())?.userId

    if (!id) redirect('/auth');

    const query = `DELETE FROM storage.session WHERE id = $1`
    await sql.query(query, [id])

    cookieStore.delete('session')

    redirect('/auth')
}