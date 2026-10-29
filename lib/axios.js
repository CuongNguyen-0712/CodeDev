import axios from "axios";

import { AUTH_ERROR } from "@/constants/auth";
import { refreshSession } from "@/lib/authRefresh";
import { goToVerifyRequired } from "@/lib/verifyLock";
import { userMessage } from "@/lib/userMessage";

export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    timeout: 10000,
});

// When a request started, so a 401 can tell whether a refresh already happened since.
api.interceptors.request.use((config) => {
    config.metadata = { ...(config.metadata || {}), startedAt: Date.now() };
    return config;
});

api.interceptors.response.use(
    (response) => response.data,
    async (error) => {
        const config = error.config;
        const status = error.response?.status;
        const code = error.response?.data?.code;

        // Expired access state: refresh (shared across requests and tabs) and replay the request
        // once. Any other 401, a second 401, or a cancelled request is returned as is.
        if (
            typeof window !== "undefined" &&
            config &&
            status === 401 &&
            code === AUTH_ERROR.ACCESS_TOKEN_EXPIRED &&
            !config._authRetried &&
            !config.signal?.aborted
        ) {
            config._authRetried = true;
            try {
                await refreshSession({ ifOlderThan: config.metadata?.startedAt || 0 });
                return await api.request(config);
            } catch (retryError) {
                if (retryError?.response || retryError?.status) return Promise.reject(retryError);
                // Refresh itself failed: fall through with the original 401.
            }
        }

        if (status === 403 && code === AUTH_ERROR.EMAIL_VERIFICATION_REQUIRED) goToVerifyRequired();

        // The server's message is written for users (lib/error/apiError.js); axios's own text
        // ("Network Error", "timeout of 10000ms exceeded", "Request failed with status code 502") is not.
        const message = userMessage(
            error.response?.data?.message || error.response?.data?.error || (error.code === "ECONNABORTED" ? "timeout of 0ms" : error.message)
        );
        const customError = new Error(message);
        customError.status = status || error.status || 500;
        customError.code = code;
        customError.data = error.response?.data;
        customError.response = error.response;
        return Promise.reject(customError);
    }
);
