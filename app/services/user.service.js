import { api } from '@/app/lib/axios'

export const userService = {
    getMe: async () => {
        const res = await api.get('/get/getInfo')

        if (!res.data.success) {
            throw new Error('Failed to fetch user data, try again later')
        }

        return Array.isArray(res.data.data)
            ? res.data.data[0]
            : res.data.data
    }
}