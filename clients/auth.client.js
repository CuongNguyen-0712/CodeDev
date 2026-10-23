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

    // Pending GitHub / Google link waiting for a password sign-in (/auth/link).
    getPendingLink: async () => {
        return await apiClient.get('/auth/link');
    },

    cancelPendingLink: async () => {
        return await apiClient.delete('/auth/link');
    },

    loginAndLink: async ({ username, password }) => {
        return await signIn('credentials', { username, password, link: '1', redirect: false });
    },

    // "Don't know this password?": mail the account owner a confirmation link instead.
    emailPendingLink: async () => {
        return await apiClient.post('/auth/link/email');
    },

    confirmLink: async (token) => {
        return await apiClient.post('/auth/link/confirm', { token });
    },

    // Settings > Sign-in methods > Connect: remember who is connecting, then leave for the provider.
    connectProvider: async (provider) => {
        await apiClient.post('/auth/link/start', { provider });
        const response = await signIn(provider, { callbackUrl: '/settings' });
        return response ?? { ok: true, redirecting: true };
    },

    verifyEmail: async (token) => {
        return await apiClient.post('/auth/verify-email', { token });
    },

    resendVerification: async () => {
        return await apiClient.post('/auth/verify-email/resend');
    },

    logout: async () => {
        return await apiClient.patch('/user/logout');
    }
};