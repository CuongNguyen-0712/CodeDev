import { ACTION } from '../actions'
import { RESOURCE } from '../resource'

export default [
    {
        path: "/course",
        action: ACTION.LIST,
        resource: RESOURCE.COURSE,
        isPublic: true
    },
    {
        path: "/course/:id",
        action: ACTION.READ,
        resource: RESOURCE.COURSE,
        isPublic: true
    }
]