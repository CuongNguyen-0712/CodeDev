import { NextResponse } from "next/server";

import { ApiError } from "@/app/lib/error/apiError";

import { userService } from "@/app/services/user.service";

export async function POST(req) {
    try {
        const { surname, name, email, username, password } = await req.json();

        if (!surname || !name || !email || !username || !password) {
            throw new ApiError('Missing required fields', 400);
        }

        const data = { surname, name, email, username, password };

        const response = await userService.signUp(data);

        return NextResponse.json({ success: response }, { status: 201 });
    }
    catch (error) {
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}