import { ACTION } from '../actions'
import { RESOURCE } from '../resource'
import { ACCESS } from '../access'

export default [
    {
        path: "/home",
        action: ACTION.LIST,
        resource: RESOURCE.HOME,
        access: ACCESS.PRIVATE
    }
]