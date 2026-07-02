import { postCreateTeam } from "@/app/actions/post/action";
import { ulid } from "ulid";

export default async function PostCreateTeamService(data) {
    const teamId = ulid();
    const { userId, name, size, description } = data;

    const result = await postCreateTeam({ teamId, userId, name, size, description });

    if (!result) {
        throw new ApiError("Failed to create team, try again later", 500);
    }

    return true;
} 