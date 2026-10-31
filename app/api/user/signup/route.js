import { NextResponse } from "next/server";

import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { SignUpSchema } from "@/lib/definition";
import { validate } from "@/lib/validate";
import { userService } from "@/services/user.service";
import { emailVerificationService } from "@/services/emailVerification.service";

/** POST /api/user/signup: creates a credentials account and mails the verification link. */
export const POST = apiRoute(async ({ req }) => {
    const body = await req.json().catch(() => {
        throw new ApiError("Invalid request body", 400);
    });

    const { success, errors } = validate(SignUpSchema, body || {});
    if (!success) {
        return NextResponse.json(
            { success: false, message: "Please fix the highlighted fields.", errors },
            { status: 422, headers: { "Cache-Control": "no-store" } }
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

    return {
        id: userId,
        username: response?.username ?? username.trim(),
        verificationSent,
    };
}, { context: "api/user/signup", auth: "none", csrf: true, limiter: rateLimiters.signup, status: 201 });
