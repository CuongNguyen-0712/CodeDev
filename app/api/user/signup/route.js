import { NextResponse } from "next/server";

import { ApiError, errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { SignUpSchema } from "@/lib/definition";
import { validate } from "@/lib/validate";

import { userService } from "@/services/user.service";
import { emailVerificationService } from "@/services/emailVerification.service";

export async function POST(req) {
    const limit = await rateLimiters.signup.limitRequest(req);
    if (!limit.allowed) return limit.response;

    try {
        const body = await req.json().catch(() => {
            throw new ApiError("Invalid request body", 400);
        });

        const { success, errors } = validate(SignUpSchema, body || {});

        if (!success) {
            return NextResponse.json(
                { success: false, message: "Please fix the highlighted fields.", errors },
                { status: 422, headers: limit.headers }
            );
        }

        const { surname, name, email, username, password } = body;

        const response = await userService.signUp({
            surname: surname.trim(),
            name: name.trim(),
            email: email.trim().toLowerCase(),
            username: username.trim(),
            password,
        });

        const userId = response?.id ?? response?.public_id ?? null;
        const verificationSent = userId ? await emailVerificationService.request(userId) : false;

        return NextResponse.json({
            success: true,
            message: "Account created successfully",
            data: {
                id: userId,
                username: response?.username ?? username.trim(),
                verificationSent,
            },
        }, { status: 201, headers: limit.headers });
    }
    catch (error) {
        return errorResponse(error, "api/user/signup", limit.headers);
    }
}
