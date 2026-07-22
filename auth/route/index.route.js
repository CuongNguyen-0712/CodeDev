import { ACTION } from '../actions';
import { RESOURCE } from '../resource';

export default [
    {
        path: "/",
        action: ACTION.LIST,
        resource: RESOURCE.INDEX,
        isPublic: true
    },
]