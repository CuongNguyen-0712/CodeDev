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
export const useUploadBlogImage = () => useMutation({ mutationFn: (file) => blogClient.uploadImage(file) });
