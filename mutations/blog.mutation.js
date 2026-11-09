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
// Optimistic: flips the post in the page's shared liked list; the caller restores its own count.
export function useSetLike() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, liked }) => (liked ? blogClient.likePost(id) : blogClient.unlikePost(id)),
        onMutate: async ({ id, liked, pageIds }) => {
            const key = blogKeys.liked(pageIds);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(key, (old) => {
                const rest = (old?.ids || []).filter((x) => x !== id);
                return { ids: liked ? [...rest, id] : rest };
            });
            return { previous };
        },
        onError: (_, { pageIds }, context) => queryClient.setQueryData(blogKeys.liked(pageIds), context?.previous),
    });
}
export const useReportPost = () => useMutation({ mutationFn: (input) => blogClient.reportPost(input) });
export const useUploadBlogImage = () => useMutation({ mutationFn: (file) => blogClient.uploadImage(file) });
