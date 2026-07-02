import { useQuery } from '@tanstack/react-query'
import { userService } from '../app/services/user.service'
import { useSession } from 'next-auth/react'

export function useUser() {
    const { status } = useSession()

    return useQuery({
        queryKey: ['me'],

        queryFn: userService.getMe,

        enabled: status === 'authenticated'
    })
}