import { NextResponse } from 'next/server'
import { getSession } from './app/lib/session'

const protectedRoutes = ['/home', '/course', '/project']
const publicRoutes = ['/auth', '/']
const publicApis = ['/api/auth/signIn', '/api/auth/signUp']

export default async function middleware(req) {
    const path = req.nextUrl.pathname
    const isProtectedRoute = protectedRoutes.some(route => path === route || path.startsWith(`${route}/`))
    const isPublicRoute = publicRoutes.includes(path)
    const isApiRoute = path.startsWith('/api')
    const isPublicApi = publicApis.includes(path)

    const session = await getSession()

    if (isApiRoute && isPublicApi && session?.userId) {
        return NextResponse.redirect(new URL('/home', req.nextUrl))
    }

    if (isApiRoute && isPublicApi) {
        return NextResponse.next()
    }

    if (isApiRoute && !session?.userId) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl))
    }

    if (isProtectedRoute && !session?.userId) {
        return NextResponse.redirect(new URL('/auth', req.nextUrl))
    }

    if (isPublicRoute && session?.userId && !path.startsWith('/home')) {
        return NextResponse.redirect(new URL('/home', req.nextUrl))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|.*\\.png$).*)']
}
