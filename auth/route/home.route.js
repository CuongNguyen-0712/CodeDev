import { ACTION } from '../actions'
import { RESOURCE } from '../resource'
import { ACCESS } from '../access'

export default [
    {
        path: "/home",
        action: ACTION.LIST,
        resource: RESOURCE.HOME,
        access: ACCESS.PRIVATE
    },
    // Both pages only load the signed-in user's own data; signed out they just hit 401s.
    {
        path: "/profile",
        action: ACTION.READ,
        resource: RESOURCE.HOME,
        access: ACCESS.PRIVATE
    },
    // Public profiles are readable signed out; the API hides private / locked accounts.
    {
        path: "/profile/:id",
        action: ACTION.READ,
        resource: RESOURCE.HOME,
        access: ACCESS.PUBLIC
    },
    {
        path: "/ranking",
        action: ACTION.LIST,
        resource: RESOURCE.HOME,
        access: ACCESS.PRIVATE
    },
    {
        path: "/contact",
        action: ACTION.LIST,
        resource: RESOURCE.HOME,
        access: ACCESS.PRIVATE
    }
]