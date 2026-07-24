import { signIn, signOut } from 'next-auth/react';

import { api } from "@/app/lib/axios";

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

    signUp: async (data) => {
        const response = await api.post('/auth/signup', data);

        if (response.error) {
            const error = new Error(response.error || "Sign up failed, please try again.");
            error.status = response.status || 500;
            throw error;
        }

        return response
    },

    logout: async () => {
        const response = await signOut({ redirect: false });

        if (response.error) {
            const error = new Error(response.error || "Logout failed, please try again.");
            error.status = response.status || 500;
            throw error;
        }

        return response
    }
}