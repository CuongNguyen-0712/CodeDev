import { api } from "@/app/lib/axios";

export const roadmapClient = {
    getList: async () => {
        const res = await api.get('/roadmap/list')
        if (!res.success) {
            throw new Error('Failed to fetch roadmap list, try again later')
        }

        return res.data
    },

    getDetails: async (id) => {
        const res = await api.get('/roadmap/details', { params: { id } })
        if (!res.success) {
            throw new Error('Failed to fetch roadmap details, try again later')
        }

        return res.data
    }
}