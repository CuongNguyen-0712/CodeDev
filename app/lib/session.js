'use server'

import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

const secretKey = process.env.SESSION_KEY
console.log('SESSION_KEY:', secretKey ? 'Defined' : 'Undefined');
const encodedKey = new TextEncoder().encode(secretKey);

export async function encrypt(payload) {
    console.log('Encrypting payload:', payload);
    if (!secretKey) throw new Error('SESSION_KEY is not defined');
    try {
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(encodedKey);
        console.log('Encrypted token:', token);
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

export async function createSession(userId) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid userId');
    }
    console.log('Creating session for userId:', userId);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await encrypt({ userId, expiresAt });
    console.log('Encrypted session:', session);
    const cookieStore = await cookies();

    cookieStore.set('session', session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        expires: expiresAt,
        sameSite: 'lax',
        path: '/',
    })
    console.log('Cookie set:', cookieStore.get('session')?.value);
}

export async function getSession() {
    const cookieStore = await cookies()
    const session = cookieStore.get('session')?.value
    return await decrypt(session)
}

export async function deleteSession() {
    const cookieStore = await cookies()
    cookieStore.delete('session')
}