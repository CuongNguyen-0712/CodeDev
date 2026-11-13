import { z } from "zod";

const userId = z.string().min(1, "Invalid user id").max(64, "Invalid user id");

export const friendTargetSchema = z.object({ userId });

export const respondSchema = z.object({ userId, accept: z.boolean() });
