import { ACTION } from '../actions'
import { RESOURCE } from '../resource'
import { ACCESS } from '../access'

export default [
    {
        path: "/auth",
        action: ACTION.READ,
        resource: RESOURCE.AUTH,
        access: ACCESS.AUTH
    },
]