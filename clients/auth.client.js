import { signIn } from 'next-auth/react';

import { apiClient } from '@/clients/api.client';

export const authClient = {
    login: async (data) => {
        const { username, password } = data;
        const response = await signIn('credentials', {
            username,
            password,
            redirect: false,
        });

        return response;
    },

    loginWithProvider: async (provider) => {
        const response = await signIn(provider, { redirect: false });

        return response;
    },

    logout: async () => {
        return await apiClient.patch('/user/logout');
    }
};