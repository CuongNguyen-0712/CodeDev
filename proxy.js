import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

import { canAccessRoute } from '@/auth/can'

import { routeConfig } from "@/auth/route.config";

import { ACCESS } from "@/auth/access";

import { isFatalSessionError } from "@/constants/auth";
import { decodeAuthJwt } from "@/lib/authJwt";

import { match } from "path-to-regexp";

// Session JWT (possibly chunked) and the refresh cookie of a session the server already ended.
const SESSION_COOKIE_NAMES = ['next-auth.session-token', '__Secure-next-auth.session-token', 'cd_refresh', '__Host-cd_refresh']

const findRoute = (pathname) => {
    return routeConfig.find(route => (
        match(route.path, { decode: decodeURIComponent })(pathname)
    ));
}

// Drops the (possibly chunked) session cookie of a session the server already ended.
const clearSessionCookie = (req, res) => {
    for (const { name } of req.cookies.getAll()) {
        if (SESSION_COOKIE_NAMES.some(base => name === base || name.startsWith(`${base}.`))) {
            res.cookies.delete(name)
        }
    }
    return res
}

export default async function proxy(req) {
    // Same codec as next-auth: algorithm allowlist + iss/aud checks (lib/authJwt).
    const rawToken = await getToken({ req, decode: decodeAuthJwt })
    const pathname = req.nextUrl.pathname

    // A token flagged revoked / expired / invalid is as good as no token.
    const deadSession = Boolean(rawToken && isFatalSessionError(rawToken.error))
    const token = deadSession ? null : rawToken

    const route = findRoute(pathname)

    const pass = () => deadSession ? clearSessionCookie(req, NextResponse.next()) : NextResponse.next()

    if (!route || route.access === ACCESS.PUBLIC) {
        return pass()
    }

    if (route.access === ACCESS.GUEST && token) {
        return NextResponse.redirect(new URL('/home', req.url))
    }

    if (route.access === ACCESS.PRIVATE || route.access === ACCESS.PROTECTED) {
        if (!token) {
            const target = deadSession
                ? new URL(`/auth/error?error=${encodeURIComponent(rawToken.error)}`, req.url)
                : new URL('/auth', req.url)

            const res = NextResponse.redirect(target)
            return deadSession ? clearSessionCookie(req, res) : res
        }

        if (route.access === ACCESS.PROTECTED) {
            const allowed = canAccessRoute({ pathname, user: token })

            if (!allowed) {
                return NextResponse.redirect(new URL('/403', req.url))
            }
        }

        // Signed-in pages must not be served from a browser / CDN cache after the user signs out.
        const res = pass()
        res.headers.set('Cache-Control', 'private, no-store, max-age=0')
        return res
    }

    return pass()
}
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|image/|font/|icons/|api/).*)',
    ],
}
