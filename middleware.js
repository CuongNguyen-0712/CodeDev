import { NextResponse } from 'next/server'
import { decrypt } from './app/lib/session'
import { cookies } from 'next/headers'

const protectedRoutes = ['/home', '/course', '/project']
const publicRoutes = ['/auth', '/']
const publicApis = ['/api/auth/signIn', '/api/auth/signUp']

export default async function middleware(req) {
    const path = req.nextUrl.pathname
    const isProtectedRoute = protectedRoutes.some(route => route === path || path.startsWith('/home/'));
    const isPublicRoute = publicRoutes.includes(path)

    const cookie = (await cookies()).get('session')?.value
    const session = await decrypt(cookie)

    if (isProtectedRoute && !session?.userId) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl))
    }

    if (publicApis.includes(path)) {
        return NextResponse.next();
    }

    if (path.startsWith('/api') && !session?.userId) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl))
    }

    if (
        isPublicRoute &&
        session?.userId &&
        !req.nextUrl.pathname.startsWith('/home')
    ) {
        return NextResponse.redirect(new URL('/home', req.nextUrl))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|.*\\.png$).*)',],
}