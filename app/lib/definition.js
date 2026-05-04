import { z } from "zod";

export const SignInSchema = z.object({
    name: z.string().trim().min(1, "Username is required"),
    pass: z.string().superRefine((val, ctx) => {
        if (!val || val.trim().length === 0) {
            ctx.addIssue({
                message: "Password is required",
            });
            return;
        }

        if (val.length < 8) {
            ctx.addIssue({
                message: "Must be at least 8 characters",
            });
        }
    }),
});

export const SignUpSchema = z.object({
    surname: z.string().trim().min(1, "Surname is required"),
    name: z.string().trim().min(1, "Name is required"),

    email: z.string().superRefine((val, ctx) => {
        if (!val || val.trim().length === 0) {
            ctx.addIssue({
                message: "Email is required",
            });
            return;
        }

        if (!val.includes('@') || !val.includes('.com')) {
            ctx.addIssue({
                message: "Email must contain @ and .com",
            });
            return;
        }
    }),

    username: z.string().trim().min(1, "Username is required"),

    password: z.string().superRefine((val, ctx) => {
        if (!val || val.trim().length === 0) {
            ctx.addIssue({
                message: "Password is required",
            });
            return;
        }

        if (val.length < 8) {
            ctx.addIssue({
                message: "Must be at least 8 characters",
            });
        }
    }),

    re_password: z.string(),

    agree: z.boolean().refine(val => val === true, {
        message: "You must agree"
    })
}).superRefine((data, ctx) => {
    if (!data.re_password || data.re_password.trim().length === 0) {
        ctx.addIssue({
            path: ["re_password"],
            message: "Re-password is required",
        });
        return;
    }

    if (data.re_password !== data.password) {
        ctx.addIssue({
            path: ["re_password"],
            message: "Re-password must be same with password",
        });
    }
});

export const CreateTeamSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Name is required"),

    size: z
        .string()
        .trim()
}).superRefine((data, ctx) => {
    const value = data.size;

    if (value === 0 || !value) {
        ctx.addIssue({
            path: ["size"],
            message: "Team size is required",
        });
        return;
    }

    if (!/^\d+$/.test(value)) {
        ctx.addIssue({
            path: ["size"],
            message: "Team size must contain numbers only"
        });
        return;
    }

    const number = Number(value);

    if (number < 2 || number > 5) {
        ctx.addIssue({
            path: ["size"],
            message: "Team size must be between 2 and 5"
        });
    }
});
export const UpdateInfoSchema = z.object({
    surname: z.string().trim().min(1, "Nickname is required"),
    name: z.string().trim().min(1, "Name is required"),

    email: z.string().superRefine((val, ctx) => {
        if (!val || val.trim().length === 0) {
            ctx.addIssue({
                message: "Email is required",
            });
            return;
        }

        if (!val.includes('@') || !val.includes('.com')) {
            ctx.addIssue({
                message: "Email must contain @ and .com",
            });
            return;
        }
    }),

    phone: z.string().superRefine((val, ctx) => {
        if (!val || val.trim().length === 0) {
            ctx.addIssue({
                message: "Phone is required",
            });
            return;
        }

        if (val.length !== 10) {
            ctx.addIssue({
                message: "Phone must be 10 digits",
            });
            return;
        }

        if (!val.match(/^\d+$/)) {
            ctx.addIssue({
                message: "Phone must be a number",
            });
            return;
        }
    }),
});

export const FeedbackSchema = z.object({
    title: z.string().trim().min(1, "Title is required"),
    feedback: z.string().trim().min(1, "Feedback is required"),
});