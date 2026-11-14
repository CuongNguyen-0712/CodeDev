import { z } from "zod";
import { NAME_CONTROLS } from "@/lib/chat/cleanFileName";

const userId = z.string().min(1, "Invalid user id").max(64, "Invalid user id");

export const teamIdSchema = z.string().regex(/^team_[0-9a-z]{26}$/, "Invalid team id");

// Controls stripped before trimming, so a name of spaces and bidi marks is empty; length in code points, as varchar(20) counts.
export const teamNameSchema = z.string()
    .transform((name) => name.replace(NAME_CONTROLS, "").trim())
    .refine((name) => name.length > 0 && [...name].length <= 20, "Team name must be 1 to 20 characters");

export const createTeamSchema = z.object({ name: teamNameSchema, memberIds: z.array(userId).min(1, "Invite 1 to 4 friends").max(4, "Invite 1 to 4 friends") });

export const inviteSchema = z.object({ teamId: teamIdSchema, userIds: z.array(userId).min(1, "Invite at least one friend") });
