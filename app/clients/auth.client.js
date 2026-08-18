import { signIn, signOut } from 'next-auth/react';

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
        const response = await signOut({ redirect: false });

        if (response.error) {
            const error = new Error(response.error || "Logout failed, please try again.");
            error.status = response.status || 500;
            throw error;
        }

        return response
    }
}