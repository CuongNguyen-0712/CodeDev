import { NextResponse } from 'next/server'
import { getSession } from './app/lib/session'

export default async function proxy(req) {
    const path = req.nextUrl.pathname
    const session = await getSession()

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
        return NextResponse.next()
    }

    if (isApiRoute && !session?.userId) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl))
    }

    if (isProtectedRoute && !session?.userId) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl))
    }

    if (isPublicRoute && session?.userId) {
        return NextResponse.redirect(new URL('/home', req.nextUrl))
    }

    return NextResponse.next()
}