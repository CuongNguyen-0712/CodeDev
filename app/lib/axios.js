import axios from "axios";

export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api",
    timeout: 10000,
});

api.interceptors.response.use(
    (response) => response.data,
    (error) => Promise.reject(error)
);