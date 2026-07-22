import { signIn, signOut } from 'next-auth/react';

export const authClient = {
    login: async (data) => {
        const { username, password, authType } = data;
        const response = await signIn(authType, {
            username,
            password,
            redirect: false,
        });


        if (response.error === "MissingCredentials" ||
            response.error === "InvalidCredentials") {

            const error = new Error("Invalid credentials");
            error.status = 401;
            throw error;
        }

        if (response.error) {
            const error = new Error("Authentication failed");
            error.status = 500;
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
            const error = new Error("Logout failed, please try again.");
            error.status = 500;
            throw error;
        }

        return response
    }
}