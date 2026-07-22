import { ACTION } from '../actions'
import { RESOURCE } from '../resource'

export default [
    {
        path: "/home",
        action: ACTION.LIST,
        resource: RESOURCE.HOME,
        isPublic: false
    },
]