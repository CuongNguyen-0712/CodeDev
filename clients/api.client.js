import { api } from '@/lib/axios';

const normalizeUrl = (url) => {
    if (!url) return '';
    return url.startsWith('/') ? url : `/${url}`;
};

const formatError = (error) => {
    const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.data?.message ||
        error.data?.error ||
        error.message ||
        "An unexpected error occurred, please try again.";

    const status = error.response?.status || error.status || 500;

    const customError = new Error(message);
    customError.status = status;
    customError.data = error.response?.data || error.data;
    customError.response = error.response;

    return customError;
};

const formatResponse = (response, defaultStatus = 200) => {
    if (response && response.success === false) {
        const error = new Error(response.message || response.error || "Request failed");
        error.status = response.status || 400;
        error.data = response;
        throw error;
    }

    if (response && typeof response === 'object') {
        return {
            ok: true,
            status: response.status || defaultStatus,
            ...response,
        };
    }

    return {
        ok: true,
        status: defaultStatus,
        data: response,
    };
};

export const apiClient = {
    request: async ({ method = 'GET', url, data = null, params = null, headers = {}, ...config }) => {
        try {
            const formattedUrl = normalizeUrl(url);
            const response = await api({
                method,
                url: formattedUrl,
                data,
                params,
                headers,
                ...config,
            });

            const defaultStatus = typeof method === 'string' && method.toUpperCase() === 'POST' ? 201 : 200;
            return formatResponse(response, defaultStatus);
        } catch (error) {
            throw formatError(error);
        }
    },

    get: async (url, config = {}) => {
        try {
            const response = await api.get(normalizeUrl(url), config);
            return formatResponse(response, 200);
        } catch (error) {
            throw formatError(error);
        }
    },

    post: async (url, data = {}, config = {}) => {
        try {
            const response = await api.post(normalizeUrl(url), data, config);
            return formatResponse(response, 201);
        } catch (error) {
            throw formatError(error);
        }
    },

    put: async (url, data = {}, config = {}) => {
        try {
            const response = await api.put(normalizeUrl(url), data, config);
            return formatResponse(response, 200);
        } catch (error) {
            throw formatError(error);
        }
    },

    patch: async (url, data = {}, config = {}) => {
        try {
            const response = await api.patch(normalizeUrl(url), data, config);
            return formatResponse(response, 200);
        } catch (error) {
            throw formatError(error);
        }
    },

    delete: async (url, config = {}) => {
        try {
            const response = await api.delete(normalizeUrl(url), config);
            return formatResponse(response, 200);
        } catch (error) {
            throw formatError(error);
        }
    },

    upload: async (url, formData, config = {}) => {
        try {
            const headers = {
                'Content-Type': 'multipart/form-data',
                ...(config.headers || {}),
            };
            const response = await api.post(normalizeUrl(url), formData, {
                ...config,
                headers,
            });
            return formatResponse(response, 201);
        } catch (error) {
            throw formatError(error);
        }
    },
};

export default apiClient;
