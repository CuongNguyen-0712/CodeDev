import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

import { ApiError } from '@/app/lib/error/apiError';

export async function POST(req) {
    const session = await getServerSession(authOptions);

    if (!session) {
        throw new ApiError('Unauthorized', 401);
    }


}