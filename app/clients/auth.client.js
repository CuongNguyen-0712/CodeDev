import { signIn } from 'next-auth/react';

import { api } from '@/app/lib/axios'

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
        const response = await api.patch('/user/logout');

        if (!response) {
            const error = new Error("Logout failed, please try again.");
            error.status = response.status || 500;
            throw error;
        }

        return response;
    }
}