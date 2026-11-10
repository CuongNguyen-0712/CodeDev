import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addCommentAction, createPostAction, deleteCommentAction, deletePostAction, reportPostAction, setPostLikeAction, updatePostAction } from "@/actions/blog.actions";
import { uploadBlogImageAction } from "@/actions/upload.actions";
import { blogKeys } from "@/keys/blog.keys";
import { callAction } from "@/lib/actionResult";

// Own-post writes change the author's list and that post's editor copy; the public list is cached server-side.
function useBlogWrite(mutationFn) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: blogKeys.mine() });
            if (variables?.id) queryClient.invalidateQueries({ queryKey: blogKeys.post(variables.id) });
        },
    });
}

export const useCreatePost = () => useBlogWrite((input) => callAction(() => createPostAction(input)));
export const useUpdatePost = () => useBlogWrite((input) => callAction(() => updatePostAction(input)));
export const useDeletePost = () => useBlogWrite((id) => callAction(() => deletePostAction(id)));
// The button owns its optimistic state; this only syncs the server truth afterwards.
export function useSetLike() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, liked }) => callAction(() => setPostLikeAction({ postId: id, liked })),
        // Every feed page may show this post, so the whole feed-state prefix goes stale.
        onSettled: (_, __, { id }) => {
            queryClient.invalidateQueries({ queryKey: blogKeys.feedState() });
            queryClient.invalidateQueries({ queryKey: blogKeys.viewer(id) });
        },
    });
}
// The new comment goes on top of the cached first page (or the list refetches when nothing is cached); the viewer query carries the count.
export function useAddComment(postId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body) => callAction(() => addCommentAction({ postId, body })),
        onSuccess: (comment) => {
            const key = blogKeys.comments(postId);
            if (queryClient.getQueryData(key)) {
                queryClient.setQueryData(key, (data) => ({
                    ...data,
                    pages: data.pages.map((page, index) => (index === 0 ? { ...page, items: [comment, ...page.items] } : page)),
                }));
            } else queryClient.invalidateQueries({ queryKey: key });
            queryClient.invalidateQueries({ queryKey: blogKeys.viewer(postId) });
            queryClient.invalidateQueries({ queryKey: blogKeys.feedState() });
        },
    });
}
export function useDeleteComment(postId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (commentId) => callAction(() => deleteCommentAction(commentId)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: blogKeys.comments(postId) });
            queryClient.invalidateQueries({ queryKey: blogKeys.viewer(postId) });
            queryClient.invalidateQueries({ queryKey: blogKeys.feedState() });
        },
    });
}
export const useReportPost = () => useMutation({ mutationFn: ({ id, reason }) => callAction(() => reportPostAction({ postId: id, reason })) });
// Same as MAX_AVATAR_BYTES in services/media.service.js; a body over 6 MB never reaches the action.
const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const useUploadBlogImage = () => useMutation({
    mutationFn: (file) => {
        if (file?.size > BLOG_IMAGE_MAX_BYTES) throw Object.assign(new Error("Images can be at most 5 MB"), { status: 413 });
        const form = new FormData();
        form.append("file", file);
        return callAction(() => uploadBlogImageAction(form));
    },
});
