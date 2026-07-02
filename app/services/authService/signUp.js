import bcrypt from "bcryptjs";
import { ulid } from "ulid";

import { signUp } from "@/app/actions/auth/action";
import { ApiError } from "@/app/lib/error/apiError";

import { generateSonyflake } from "@/app/lib/sonyflake";

export default async function SignUpService(data) {
    const { surname, name, email, username, password } = data;

    const id = generateSonyflake();

    const public_id = ulid();
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const result = await signUp({ id, public_id, surname, name, email, username, password: hashPassword });

    if (!result) {
        throw new ApiError("Failed to sign up user", 500);
    }

    return true
}