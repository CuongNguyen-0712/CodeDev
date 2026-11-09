import { useMutation, useQueryClient } from "@tanstack/react-query";

import { blogClient } from "@/clients/blog.client";
import { blogKeys } from "@/keys/blog.keys";

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
        mutationFn: ({ id, liked }) => (liked ? blogClient.likePost(id) : blogClient.unlikePost(id)),
        onSettled: (_, __, { id, pageIds }) => {
            queryClient.invalidateQueries({ queryKey: blogKeys.liked(pageIds) });
            queryClient.invalidateQueries({ queryKey: blogKeys.viewer(id) });
        },
    });
}
// The new comment goes on top of the cached first page; the viewer query carries the count.
export function useAddComment(postId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body) => blogClient.addComment({ id: postId, body }),
        onSuccess: (comment) => {
            queryClient.setQueryData(blogKeys.comments(postId), (data) => data && {
                ...data,
                pages: data.pages.map((page, index) => (index === 0 ? { ...page, items: [comment, ...page.items] } : page)),
            });
            queryClient.invalidateQueries({ queryKey: blogKeys.viewer(postId) });
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
        },
    });
}
export const useReportPost = () => useMutation({ mutationFn: (input) => blogClient.reportPost(input) });
export const useUploadBlogImage = () => useMutation({ mutationFn: (file) => blogClient.uploadImage(file) });
