import { ACTION } from '../actions'
import { RESOURCE } from '../resource'

export default [
    {
        path: "/blog",
        action: ACTION.LIST,
        resource: RESOURCE.BLOG,
        isPublic: true
    },
]