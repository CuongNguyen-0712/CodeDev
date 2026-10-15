import { NextResponse } from 'next/server';
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from '@/lib/error/apiError';

// Placeholder: email sending is not wired up yet (see docs/development-plan.md).
export async function POST() {
    try {
        const session = await getAuthSession();

        if (!session) {
            throw new ApiError('Unauthorized', 401);
        }

        return NextResponse.json(
            { success: false, message: 'Sending email is not available yet.' },
            { status: 501 }
        );
    } catch (error) {
        return errorResponse(error, 'api/post/sendEmail');
    }
}
