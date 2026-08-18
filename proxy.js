import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

import { canAccessRoute } from '@/auth/can'

import { routeConfig } from "@/auth/route.config";

import { ACCESS } from "@/auth/access";

import { match } from "path-to-regexp";

const findRoute = (pathname) => {
    return routeConfig.find(route => (
        match(route.path, { decode: decodeURIComponent })(pathname)
    ));
}

export default async function proxy(req) {
    const token = await getToken({ req })
    const pathname = req.nextUrl.pathname

    const route = findRoute(pathname)

    if (!route) {
        return NextResponse.next()
    }

    if (route.access === ACCESS.PUBLIC) {
        return NextResponse.next()
    }

    if (route.access === ACCESS.AUTH && token) {
        return NextResponse.redirect(new URL('/home', req.url))
    }

    if (route.access === ACCESS.PRIVATE || route.access === ACCESS.PROTECTED) {
        if (!token) {
            return NextResponse.redirect(new URL('/auth', req.url))
        }

        if (route.access === ACCESS.PROTECTED) {
            const allowed = canAccessRoute({ pathname, user: token })

            if (!allowed) {
                return NextResponse.redirect(new URL('/403', req.url))
            }
        }
    }

    return NextResponse.next()
}
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|image/|font/|icons/|api/).*)',
    ],
}