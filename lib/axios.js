import axios from "axios";

export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    timeout: 10000,
});

api.interceptors.response.use(
    (response) => response.data,
    (error) => {
        const message =
            error.response?.data?.message ||
            error.response?.data?.error ||
            error.message ||
            "Something went wrong";
        const customError = new Error(message);
        customError.status = error.response?.status || error.status || 500;
        customError.data = error.response?.data;
        customError.response = error.response;
        return Promise.reject(customError);
    }
);