import { NextResponse } from "next/server";

import { ApiError } from "@/lib/error/apiError";

import { userService } from "@/services/user.service";

export async function POST(req) {
    try {
        const { surname, name, email, username, password } = await req.json();

        if (!surname || !name || !email || !username || !password) {
            throw new ApiError('Missing required fields', 400);
        }

        const data = { surname, name, email, username, password };

        const response = await userService.signUp(data);

        return NextResponse.json({
            success: true,
            message: "Account created successfully",
            data: response
        }, { status: 201 });
    }
    catch (error) {
        const status = error.status || (error.code === 'P0001' || error.code === '23505' ? 409 : 500);
        return NextResponse.json({
            success: false,
            message: error.message || "Internal Server Error",
            error: error.message || "Internal Server Error"
        }, { status });
    }
}