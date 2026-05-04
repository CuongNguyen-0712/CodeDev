import { NextResponse } from "next/server";

import { ApiError } from "@/app/lib/error/apiError";

import SignUpService from "@/app/services/authService/signUp";

export async function POST(req) {
    try {
        const { surname, name, email, username, password } = await req.json();

        if (!surname || !name || !email || !username || !password) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { surname, name, email, username, password };

        const response = await SignUpService(data);

        return NextResponse.json({ success: response }, { status: 200 });
    }
    catch (error) {
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}