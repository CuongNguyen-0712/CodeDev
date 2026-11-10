import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setPostLikeAction } from "@/actions/blog.actions";
import { blogClient } from "@/clients/blog.client";
import { blogKeys } from "@/keys/blog.keys";
import { callWithAuthRetry, unwrapActionResult } from "@/lib/actionResult";

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

export const useCreatePost = () => useBlogWrite((input) => blogClient.createPost(input));
export const useUpdatePost = () => useBlogWrite((input) => blogClient.updatePost(input));
export const useDeletePost = () => useBlogWrite((id) => blogClient.deletePost(id));
// The button owns its optimistic state; this only syncs the server truth afterwards.
export function useSetLike() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, liked }) => unwrapActionResult(await callWithAuthRetry(() => setPostLikeAction({ postId: id, liked }))),
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
        mutationFn: (body) => blogClient.addComment({ id: postId, body }),
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
        mutationFn: (commentId) => blogClient.deleteComment(commentId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: blogKeys.comments(postId) });
            queryClient.invalidateQueries({ queryKey: blogKeys.viewer(postId) });
            queryClient.invalidateQueries({ queryKey: blogKeys.feedState() });
        },
    });
}
export const useReportPost = () => useMutation({ mutationFn: (input) => blogClient.reportPost(input) });
export const useUploadBlogImage = () => useMutation({ mutationFn: (file) => blogClient.uploadImage(file) });
