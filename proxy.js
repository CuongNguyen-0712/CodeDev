import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export default async function proxy(req) {
    const path = req.nextUrl.pathname
    const token = await getToken({ req })

    const isLoggedIn = !!token

    if (path.startsWith('/api/auth')) {
        return NextResponse.next()
    }

    const protectedRoutes = ['/home', '/course', '/project']
    const publicRoutes = ['/auth', '/']
    const publicApis = ['/api/auth/signIn', '/api/auth/signUp']

    const isProtectedRoute = protectedRoutes.some(
        route => path === route || path.startsWith(`${route}/`)
    )
    const isPublicRoute = publicRoutes.includes(path)

    const isApiRoute = path.startsWith('/api')
    const isPublicApi = publicApis.some(api => path.startsWith(api))

    if (isApiRoute && isPublicApi) {
        return NextResponse.next();
    }

    if (isApiRoute && !isLoggedIn) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl));
    }

    if (isProtectedRoute && !isLoggedIn) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl));
    }

    if (isPublicRoute && isLoggedIn) {
        return NextResponse.redirect(new URL('/home', req.nextUrl));
    }

    return NextResponse.next()
}