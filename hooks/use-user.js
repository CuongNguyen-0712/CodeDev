import { useQuery } from '@tanstack/react-query'
import { userService } from '../app/services/user.service'
import { useSession } from 'next-auth/react'

export function useUser() {
    const { status, session } = useSession()
    const userId = session?.user?.id

    return useQuery({
        queryKey: ['me', userId],

        queryFn: userService.getMe,

        enabled: status === 'authenticated'
    })
}