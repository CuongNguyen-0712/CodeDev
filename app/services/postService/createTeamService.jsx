import { postCreateTeam } from "@/app/actions/post/action";
import { v4 as uuidv4 } from "uuid";

export default async function PostCreateTeamService(data) {
    const teamId = uuidv4();
    const { userId, name, size, description } = data;

    const result = await postCreateTeam({ teamId, userId, name, size, description });

    if (!result) {
        throw new ApiError("Failed to create team, try again later", 500);
    }

    return true;
} 