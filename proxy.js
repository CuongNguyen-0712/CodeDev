import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

import { canAccessRoute } from '@/auth/can'

export default async function proxy(req) {
    const token = await getToken({ req })
    const pathname = req.nextUrl.pathname

    const allowed = canAccessRoute({ pathname, user: token })

    if (!allowed) {
        return NextResponse.redirect(new URL('/403', req.url))
    }

    return NextResponse.next()
}
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|image/|font/|icons/).*)',
    ],
}