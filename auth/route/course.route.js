import { ACTION } from '../actions'
import { RESOURCE } from '../resource'
import { ACCESS } from '../access'

export default [
    {
        path: "/course",
        action: ACTION.LIST,
        resource: RESOURCE.COURSE,
        access: ACCESS.PUBLIC,
    },
    {
        path: "/course/:id",
        action: ACTION.READ,
        resource: RESOURCE.COURSE,
        access: ACCESS.PUBLIC
    },
    {
        path: '/api/course/learning',
        action: ACTION.LEARN,
        resource: RESOURCE.COURSE,
        access: ACCESS.PROTECTED
    },
    {
        path: '/api/course/comment',
        action: ACTION.COMMENT,
        resource: RESOURCE.COURSE,
        access: ACCESS.PROTECTED
    },
    {
        path: '/api/course/register',
        action: ACTION.CREATE,
        resource: RESOURCE.COURSE,
        access: ACCESS.PROTECTED
    },
    {
        path: '/api/course/favorite',
        action: ACTION.CREATE,
        resource: RESOURCE.COURSE,
        access: ACCESS.PRIVATE
    },
    {
        path: '/api/course/unfavorite',
        action: ACTION.DELETE,
        resource: RESOURCE.COURSE,
        access: ACCESS.PRIVATE
    }
]