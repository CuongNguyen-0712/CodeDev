import axios from "axios";

export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Response interceptor: handle unauthorized responses centrally
if (typeof window !== 'undefined') {
    api.interceptors.response.use(
        (response) => response,
        (error) => {
            const status = error.response?.status;
            if (status === 401) {
                try {
                    // redirect to auth page for client-side flows
                    window.location.href = '/auth';
                } catch (e) { }
            }
            return Promise.reject(error);
        }
    );
}