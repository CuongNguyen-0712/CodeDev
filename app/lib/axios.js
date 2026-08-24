import axios from "axios";

export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    timeout: 10000,
});

api.interceptors.response.use(
    (response) => response.data,
    (error) => Promise.reject(error)
);