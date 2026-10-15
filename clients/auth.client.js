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

    // OAuth always leaves the page (to the provider, then back to callbackUrl), so next-auth
    // resolves with nothing: report that as "redirecting" rather than as a failure.
    loginWithProvider: async (provider) => {
        const response = await signIn(provider, { callbackUrl: '/home' });

        return response ?? { ok: true, redirecting: true };
    },

    logout: async () => {
        return await apiClient.patch('/user/logout');
    }
};