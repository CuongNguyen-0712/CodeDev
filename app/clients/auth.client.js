import { signIn } from 'next-auth/react';

import { api } from '@/app/lib/axios'

export const authClient = {
    login: async (data) => {
        const { username, password, authType } = data;
        const response = await signIn(authType, {
            username,
            password,
            redirect: false,
        });

        if (response.error) {
            const error = new Error(response.error || "Login failed, please try again.");
            error.status = response.status || 500;
            throw error;
        }

        return response;
    },

    loginWithProvider: async (provider) => {
        return await signIn(provider, { callbackUrl: '/home' });
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