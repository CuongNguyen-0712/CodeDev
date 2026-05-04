import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

import { signUp } from "@/app/actions/auth/action";
import { ApiError } from "@/app/lib/error/apiError";

export default async function SignUpService(data) {
    const { surname, name, email, username, password } = data;

    const id = uuidv4();
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const result = await signUp({ id, surname, name, email, username, password: hashPassword });

    if (!result) {
        throw new ApiError("Failed to sign up user", 500);
    }

    return true
}