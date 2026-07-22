import { ACTION } from '../actions';
import { RESOURCE } from '../resource';

export default [
    {
        path: "/settings",
        action: ACTION.LIST,
        resource: RESOURCE.SETTINGS,
        isPublic: true
    },
]