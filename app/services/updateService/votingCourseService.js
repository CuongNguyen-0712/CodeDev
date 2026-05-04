import { updateVotingComment } from "@/app/actions/patch/action";

export default async function UpdateVotingCommentService(data) {
    const { userId, commentId, isVoted } = data;

    const result = await updateVotingComment({ userId, commentId, isVoted });

    if (!result) {
        throw new ApiError("Failed to update voting comment", 500);
    }

    return result;
}