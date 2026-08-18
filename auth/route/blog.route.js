import { ACTION } from '../actions'
import { RESOURCE } from '../resource'
import { ACCESS } from '../access'

export default [
    {
        path: "/blog",
        action: ACTION.LIST,
        resource: RESOURCE.BLOG,
        access: ACCESS.PUBLIC,
    },
]